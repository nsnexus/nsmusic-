// Ponto único de aprovação de pagamento, consumido por api/webhooks/efi e por api/payments/status
// (M-18 no AUDIT_REPORT.md — antes essa lógica estava duplicada e já tinha divergido entre os dois
// arquivos). Agnóstico de provedor: recebe um objeto normalizado { status, transaction_amount },
// hoje montado a partir da consulta à API Pix da Efí (antes, do Mercado Pago).
//
// Garante, nesta ordem:
//   - idempotência por paymentId via runTransaction (A-09) — webhook e polling podem chegar juntos;
//   - paymentStatus só é escrito quando o SKU realmente aprova a música (C-09), nunca no add-on isolado;
//   - o SKU vem do paymentIntent persistido em /api/payments/create, não de uma heurística de valor (A-13);
//   - estados de estorno/cancelamento revogam acesso já concedido, o que nunca era tratado antes.

import { doc, getDoc, updateDoc, runTransaction } from 'firebase/firestore/lite';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { dbEdge as db } from './firebase-edge';
import { skuApprovesMusic, skuGrantsVideoAccess } from './pricing';
import { resolveDeliveryUrl, buildApprovalMessage, buildAdminSaleNotification } from './whatsappTemplates';

// B-06 no AUDIT_REPORT.md: o telefone do admin estava hardcoded no código-fonte. Exportado para
// reuso por api/reports/daily-sales, que envia ao mesmo número.
export function getAdminWhatsAppNumber() {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.ADMIN_WHATSAPP) return String(ctx.env.ADMIN_WHATSAPP).trim();
  } catch (e) {}
  return String(process.env.ADMIN_WHATSAPP || '').trim();
}

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

  let txResult;
  try {
    txResult = await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) return { applied: false, reason: 'order_not_found' };

      const orderData = snap.data();

      // A-13: usa o SKU persistido pela criação da cobrança; heurística de valor só como fallback
      // para pedidos antigos que nunca passaram pelo novo /api/payments/create.
      const sku = orderData.paymentIntentSku
        || (Math.abs(Number(payment.transaction_amount) - 6.90) < 0.01 ? 'video_addon' : 'audio_only');

      const isVideoOnly = !skuApprovesMusic(sku);
      const dedupKey = isVideoOnly ? 'videoPaymentId' : 'paymentId';

      // Idempotência: mesmo paymentId já aplicado antes (webhook e polling correndo em paralelo).
      if (String(orderData[dedupKey] || '') === String(paymentId)) {
        return { applied: false, reason: 'already_processed', sku };
      }

      const nowIso = new Date().toISOString();
      const updates = { updatedAt: nowIso };

      if (isVideoOnly) {
        updates.hasVideoAccess = true;
        updates.videoAddonPaid = true;
        updates.videoPaymentId = String(paymentId);
        // Usado pelo relatório diário de vendas (api/reports/daily-sales) para contar pagamentos de
        // vídeo por período, sem depender de videoStatus (que só existe depois da renderização no
        // navegador do cliente, um evento não confiável de servidor).
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

      tx.update(orderRef, updates);

      return {
        applied: true,
        sku,
        isVideoOnly,
        customerPhone: orderData.customerPhone || null,
        customerName: orderData.customerName || 'Cliente',
        honoreeName: orderData.honoreeName || 'alguém especial',
      };
    });
  } catch (err) {
    console.error('[payments] Falha na transação de aprovação:', err.message);
    return { applied: false, reason: 'transaction_failed' };
  }

  if (txResult.applied) {
    await notifyApprovalByWhatsApp(orderRef, txResult);
  }

  return txResult;
}

async function revokeApproval(orderRef, paymentId, status) {
  try {
    let revoked = false;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) return;
      const orderData = snap.data();

      const updates = { updatedAt: new Date().toISOString() };
      if (String(orderData.videoPaymentId || '') === String(paymentId)) {
        updates.hasVideoAccess = false;
        updates.videoAddonPaid = false;
        revoked = true;
      } else if (String(orderData.paymentId || '') === String(paymentId)) {
        updates.paymentStatus = 'AGUARDANDO_PAGAMENTO';
        revoked = true;
      }

      if (revoked) tx.update(orderRef, updates);
    });
    return { applied: revoked, revoked, status };
  } catch (err) {
    console.error('[payments] Falha na transação de revogação:', err.message);
    return { applied: false, reason: 'transaction_failed' };
  }
}

// Efeito colateral isolado (payments.md: nunca pode impedir a gravação da aprovação, que já
// aconteceu antes desta função ser chamada).
async function notifyApprovalByWhatsApp(orderRef, approval) {
  if (!approval.customerPhone) return;

  const sentFlag = approval.isVideoOnly ? 'videoPaymentWhatsappSent' : 'paymentWhatsappSent';

  try {
    let shouldSend = false;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(orderRef);
      if (!snap.exists()) return;
      const data = snap.data();
      if (!data[sentFlag] && !data[`${sentFlag}Sending`]) {
        tx.update(orderRef, { [`${sentFlag}Sending`]: true });
        shouldSend = true;
      }
    });

    if (!shouldSend) return;

    const { sendWhatsAppMessage } = await import('./whatsapp');
    const deliveryUrl = resolveDeliveryUrl(orderRef.id);
    const messageText = buildApprovalMessage({
      isVideo: approval.isVideoOnly,
      customerName: approval.customerName,
      honoreeName: approval.honoreeName,
      deliveryUrl,
    });

    const sent = await sendWhatsAppMessage(approval.customerPhone, messageText);

    // Notifica o admin de toda venda aprovada — efeito colateral isolado, nunca bloqueia a aprovação
    // em si nem o envio ao cliente (payments.md: side effects sempre em try/catch próprio).
    const adminPhone = getAdminWhatsAppNumber();
    if (adminPhone) {
      const adminMessage = buildAdminSaleNotification({
        customerName: approval.customerName,
        honoreeName: approval.honoreeName,
        isVideo: approval.isVideoOnly,
      });
      await sendWhatsAppMessage(adminPhone, adminMessage).catch((e) =>
        console.warn('[payments] Erro ao notificar admin:', e.message)
      );
    }

    if (sent) {
      await updateDoc(orderRef, {
        [sentFlag]: true,
        [`${sentFlag}At`]: new Date().toISOString(),
        [`${sentFlag}Sending`]: false,
      }).catch((e) => console.warn('[payments] Erro ao marcar WhatsApp enviado:', e.message));
    } else {
      await updateDoc(orderRef, { [`${sentFlag}Sending`]: false }).catch((e) => console.warn(e.message));
    }
  } catch (err) {
    console.error('[payments] Erro geral no envio de WhatsApp:', err.message);
  }
}
