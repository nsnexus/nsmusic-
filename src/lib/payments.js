// Ponto único de aprovação de pagamento, consumido por api/webhooks/efi e por api/payments/status
// (M-18 no AUDIT_REPORT.md — antes essa lógica estava duplicada e já tinha divergido entre os dois
// arquivos). Agnóstico de provedor: recebe um objeto normalizado { status, transaction_amount },
// hoje montado a partir da consulta à API Pix da Efí (antes, do Mercado Pago).
//
// Garante, nesta ordem:
//   - idempotência por paymentId via checagem sequencial getDoc + updateDoc (A-09) — webhook e
//     polling podem chegar juntos; runTransaction não é usado porque não existe em
//     firebase/firestore/lite, o SDK deste arquivo no Edge Runtime;
//   - paymentStatus só é escrito quando o SKU realmente aprova a música (C-09), nunca no add-on isolado;
//   - o SKU vem do paymentIntent persistido em /api/payments/create, não de uma heurística de valor (A-13);
//   - estados de estorno/cancelamento revogam acesso já concedido, o que nunca era tratado antes.

import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';
import { skuApprovesMusic, skuGrantsVideoAccess } from './pricing';
import { resolveDeliveryUrl } from './whatsappTemplates';

const REVOKING_STATUSES = new Set(['cancelled', 'refunded', 'charged_back']);

/**
 * Aplica uma transição de estado de pagamento a um pedido.
 * @param {string} orderId
 * @param {string|number} paymentId txid (Efí) que identifica a cobrança
 * @param {{status: string, transaction_amount?: number}} payment
 * @returns {Promise<{applied: boolean, reason?: string, revoked?: boolean, sku?: string}>}
 */
export async function applyPaymentApproval(orderId, paymentId, payment) {
  if (!orderId || !paymentId || !payment) {
    return { applied: false, reason: 'missing_arguments' };
  }

  const orderRef = doc(db, 'orders', orderId);
  const status = payment.status;

  if (REVOKING_STATUSES.has(status)) {
    return revokeApproval(orderRef, paymentId, status);
  }

  if (status !== 'approved') {
    return { applied: false, reason: 'not_approved', status };
  }

  // Edge Runtime (Cloudflare) roda em firebase/firestore/lite, que não expõe runTransaction —
  // toda vez que era chamada aqui, a promise rejeitava e a aprovação inteira falhava (silenciosa,
  // só visível no log). Substituída por checagem sequencial: getDoc para ler o estado atual e
  // idempotência, updateDoc para gravar. Numa corrida bem apertada entre webhook e polling, as duas
  // chamadas podem passar pela checagem de "já processado" antes de qualquer updateDoc acontecer —
  // pior caso é reescrever os mesmos campos uma vez a mais, nunca uma dupla cobrança (o paymentId
  // gravado é sempre o mesmo, então a segunda escrita apenas repete o primeiro resultado).
  let txResult;
  try {
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      txResult = { applied: false, reason: 'order_not_found' };
    } else {
      const orderData = snap.data();

      // A-13: usa o SKU persistido pela criação da cobrança; heurística de valor só como fallback
      // para pedidos antigos que nunca passaram pelo novo /api/payments/create.
      const sku = orderData.paymentIntentSku
        || (Math.abs(Number(payment.transaction_amount) - 6.90) < 0.01 ? 'video_addon' : 'audio_only');

      const isVideoOnly = !skuApprovesMusic(sku);
      const dedupKey = isVideoOnly ? 'videoPaymentId' : 'paymentId';

      // Idempotência: mesmo paymentId já aplicado antes (webhook e polling correndo em paralelo).
      if (String(orderData[dedupKey] || '') === String(paymentId)) {
        txResult = { applied: false, reason: 'already_processed', sku };
      } else {
        const nowIso = new Date().toISOString();
        const updates = { updatedAt: nowIso };

        if (isVideoOnly) {
          updates.hasVideoAccess = true;
          updates.videoAddonPaid = true;
          updates.videoPaymentId = String(paymentId);
          // Timestamp do pagamento do add-on, independente de videoStatus (que só existe depois da
          // renderização no navegador do cliente, um evento não confiável de servidor).
          updates.videoPaidAt = nowIso;
        } else {
          // C-09: paymentStatus só é escrito neste ramo — o add-on de vídeo isolado nunca o altera.
          updates.paymentStatus = 'PAGAMENTO_APROVADO';
          updates.paymentId = String(paymentId);
          updates.paidAt = nowIso;
          if (skuGrantsVideoAccess(sku)) {
            updates.hasVideoAccess = true;
            updates.videoAddonPaid = true;
            updates.videoPaidAt = nowIso;
          }
        }

        await updateDoc(orderRef, updates);

        txResult = { applied: true, sku, isVideoOnly, orderData };
      }
    }
  } catch (err) {
    console.error('[payments] Falha ao aplicar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  }

  // Efeito colateral isolado (payments.md: nunca pode impedir a gravação da aprovação, que já
  // aconteceu acima) — só pra pagamento da música (não pro add-on de vídeo isolado).
  if (txResult.applied && !txResult.isVideoOnly) {
    await notifyPaymentApproved(orderRef, txResult.orderData);
  }

  const { orderData: _omit, ...publicResult } = txResult;
  return publicResult;
}

// Exportada para permitir reenvio manual pelo admin (api/admin/notify-payment-approved) quando o
// pedido é aprovado manualmente no painel — updateDoc direto do browser (admin/pedidos/[id]/page.jsx)
// não passa por applyPaymentApproval, então o WhatsApp automático nunca dispararia sem isso.
export async function notifyPaymentApproved(orderRef, orderData) {
  if (!orderData?.customerPhone) return;

  try {
    let shouldSend = false;
    const snap = await getDoc(orderRef);
    if (snap.exists()) {
      const data = snap.data();
      if (!data.paymentWhatsappSent && !data.paymentWhatsappSending) {
        await updateDoc(orderRef, { paymentWhatsappSending: true });
        shouldSend = true;
      }
    }

    if (!shouldSend) return;

    const { sendPaymentApprovedTemplate } = await import('./whatsapp');
    const deliveryUrl = resolveDeliveryUrl(orderRef.id);
    const sendResult = await sendPaymentApprovedTemplate(orderData.customerPhone, {
      customerName: orderData.customerName,
      honoreeName: orderData.honoreeName,
      deliveryUrl,
      // audioFiles já inclui audioUrl como primeiro item (ver src/lib/db.js:updateTaskResult) —
      // audioUrl só como fallback pra pedidos antigos sem audioFiles gravado.
      audioUrls: (orderData.audioFiles?.length ? orderData.audioFiles : [orderData.audioUrl]).filter(Boolean),
    });

    if (sendResult.success) {
      await updateDoc(orderRef, {
        paymentWhatsappSent: true,
        paymentWhatsappSentAt: new Date().toISOString(),
        paymentWhatsappSending: false,
      }).catch((e) => console.warn('[payments] Erro ao marcar WhatsApp enviado:', e.message));
    } else {
      await updateDoc(orderRef, { paymentWhatsappSending: false }).catch((e) => console.warn(e.message));
      console.warn(`Falha ao enviar WhatsApp (pagamento aprovado) — pedido ${orderRef.id}`);
    }
  } catch (err) {
    console.error('[payments] Erro geral no envio de WhatsApp:', err.message);
  }
}

async function revokeApproval(orderRef, paymentId, status) {
  try {
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return { applied: false, reason: 'order_not_found', status };
    const orderData = snap.data();

    const updates = { updatedAt: new Date().toISOString() };
    let revoked = false;
    if (String(orderData.videoPaymentId || '') === String(paymentId)) {
      updates.hasVideoAccess = false;
      updates.videoAddonPaid = false;
      revoked = true;
    } else if (String(orderData.paymentId || '') === String(paymentId)) {
      updates.paymentStatus = 'AGUARDANDO_PAGAMENTO';
      revoked = true;
    }

    if (revoked) await updateDoc(orderRef, updates);
    return { applied: revoked, revoked, status };
  } catch (err) {
    console.error('[payments] Falha ao revogar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  }
}
