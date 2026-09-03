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
import { skuApprovesMusic, skuGrantsVideoAccess, getPriceForSku } from './pricing';
import { resolveDeliveryUrl } from './whatsappTemplates';
import { sendMetaPurchaseEvent } from './metaCapi';
import { requestPlaybackGeneration } from './playback';

const REVOKING_STATUSES = new Set(['cancelled', 'refunded', 'charged_back']);

/**
 * Aplica uma transição de estado de pagamento a um pedido.
 * @param {string} orderId
 * @param {string|number} paymentId txid (Efí) que identifica a cobrança
 * @param {{status: string, transaction_amount?: number}} payment
 * @param {object} env contexto de ambiente resolvido pela rota chamadora — usado só para o evento
 *   de Purchase da Meta Conversions API (META_CAPI_ACCESS_TOKEN); opcional, sem ele o evento
 *   simplesmente não é enviado (log de aviso, nunca falha a aprovação em si).
 * @returns {Promise<{applied: boolean, reason?: string, revoked?: boolean, sku?: string}>}
 */
export async function applyPaymentApproval(orderId, paymentId, payment, env = {}) {
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

      // O SKU tem que ser o da cobrança QUE ESTÁ SENDO PAGA (identificada pelo txid), não o da
      // última cobrança criada no pedido.
      //
      // Achado 30/08/2026: `paymentIntentSku` guarda só a cobrança mais recente. Quando a aprovação
      // chegava de uma cobrança anterior — retentativa de webhook da Efí, cron de reconciliação, ou
      // cliente pagando um QR Code antigo — ela era creditada ao produto errado. Na prática: quem
      // pagou a música e depois apenas ABRIU a oferta de playback (o que já cria a cobrança e
      // sobrescreve paymentIntentSku) ganhava o playback de graça assim que qualquer notificação
      // atrasada da música chegasse. O mesmo valia para o add-on de vídeo.
      //
      // paymentIntentSkuByTxid é o mapa txid -> SKU gravado por /api/payments/create. Só caímos no
      // paymentIntentSku quando o txid pago é mesmo o da cobrança atual (pedido criado antes do mapa
      // existir), e na heurística de valor para os mais antigos ainda.
      const skuByTxid = orderData.paymentIntentSkuByTxid || {};
      const skuForThisTxid = skuByTxid[String(paymentId)];
      // Sem paymentIntentId registrado não há como afirmar que este txid é de OUTRA cobrança — nesse
      // caso mantém o comportamento anterior (confiar em paymentIntentSku). O bloqueio só vale
      // quando existe evidência de que a cobrança paga é diferente da última criada.
      const hasIntentId = Boolean(orderData.paymentIntentId);
      const isCurrentIntent = !hasIntentId || String(orderData.paymentIntentId) === String(paymentId);

      const sku = skuForThisTxid
        || (isCurrentIntent ? orderData.paymentIntentSku : null)
        || (Math.abs(Number(payment.transaction_amount) - 6.90) < 0.01 ? 'video_addon' : 'audio_only');

      if (!skuForThisTxid && !isCurrentIntent) {
        // Cobrança antiga sem registro próprio: o SKU acima veio da heurística de valor. Fica no log
        // para dar rastro caso um pedido antigo seja creditado ao produto errado.
        console.warn(`[payments] txid sem SKU registrado e diferente do intent atual — SKU inferido por valor: ${sku}`);
      }

      const isVideoOnly = sku === 'video_addon';
      const isPlaybackOnly = sku === 'playback_addon';
      const isCartaOnly = sku === 'carta_addon';
      const dedupKey = isVideoOnly ? 'videoPaymentId'
        : isPlaybackOnly ? 'playbackPaymentId'
        : isCartaOnly ? 'cartaPaymentId'
        : 'paymentId';

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
        } else if (isPlaybackOnly) {
          updates.hasPlaybackAccess = true;
          updates.playbackAddonPaid = true;
          updates.playbackPaymentId = String(paymentId);
          updates.playbackPaidAt = nowIso;
        } else if (isCartaOnly) {
          updates.hasCartaAccess = true;
          updates.cartaAddonPaid = true;
          updates.cartaPaymentId = String(paymentId);
          updates.cartaPaidAt = nowIso;
        } else {
          // C-09: paymentStatus só é escrito neste ramo — os add-ons isolados nunca o alteram.
          updates.paymentStatus = 'PAGAMENTO_APROVADO';
          updates.paymentId = String(paymentId);
          updates.paidAt = nowIso;

          // 'impacto' ("pague conforme o impacto emocional", ver /pagar e /api/payments/create) tem
          // preço variável — o vídeo é liberado por FAIXA do valor realmente pago na Efí (nunca do
          // que o cliente alegou pedir), a partir do mesmo preço do combo normal (getPriceForSku),
          // pra não existir um segundo número "quase igual" flutuando pelo sistema. -0.01 é a mesma
          // tolerância usada em toda comparação monetária do projeto (nunca ===, ver payments.md).
          const paidAmount = Number(payment.transaction_amount) || 0;
          const comboPrice = getPriceForSku('combo');
          const grantsVideoByImpactAmount = sku === 'impacto' && comboPrice !== null && paidAmount >= comboPrice - 0.01;

          if (skuGrantsVideoAccess(sku) || grantsVideoByImpactAmount) {
            updates.hasVideoAccess = true;
            updates.videoAddonPaid = true;
            updates.videoPaidAt = nowIso;
          }
        }

        await updateDoc(orderRef, updates);

        txResult = { applied: true, sku, isVideoOnly, isPlaybackOnly, isCartaOnly, orderData };
      }
    }
  } catch (err) {
    console.error('[payments] Falha ao aplicar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  }

  // Efeitos colaterais isolados (payments.md: nunca podem impedir a gravação da aprovação, que já
  // aconteceu acima). WhatsApp só pra pagamento da música; Purchase da Meta pros dois casos (a venda
  // do add-on isolado é receita real, tem que contar também — ver src/lib/metaCapi.js).
  if (txResult.applied) {
    if (!txResult.isVideoOnly && !txResult.isPlaybackOnly && !txResult.isCartaOnly) {
      await notifyPaymentApproved(orderRef, txResult.orderData);
    }

    // Playback (instrumental) é gerado automaticamente assim que o pagamento do add-on é aprovado —
    // sem clique extra do cliente. Isolado em try/catch próprio (payments.md: efeito colateral nunca
    // pode impedir a gravação da aprovação, que já aconteceu acima) e com a mesma reserva sequencial
    // usada abaixo pro Meta CAPI, pra não disparar a Kie.ai duas vezes se webhook e polling do
    // pagamento chegarem juntos (cada chamada cobra crédito da Kie.ai, sem estorno).
    if (txResult.isPlaybackOnly) {
      try {
        let shouldGenerate = false;
        const freshSnap = await getDoc(orderRef);
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          if (!freshData.playbackRequested && !freshData.playbackRequesting) {
            await updateDoc(orderRef, { playbackRequesting: true });
            shouldGenerate = true;
          }
        }

        if (shouldGenerate) {
          const sunoTaskId = txResult.orderData?.sunoTaskId;
          const audioId = txResult.orderData?.audioIds?.[0];
          if (sunoTaskId && audioId) {
            const genResult = await requestPlaybackGeneration({ orderId, sunoTaskId, audioId }, env);
            await updateDoc(orderRef, {
              playbackRequested: true,
              playbackRequesting: false,
            }).catch((e) => console.warn('[payments] Erro ao marcar playback solicitado:', e.message));
            if (!genResult.ok) {
              console.warn(`[payments] Falha ao iniciar playback (Kie.ai) — pedido ${orderId}:`, genResult.error);
            }
          } else {
            console.warn(`[payments] Pedido ${orderId} sem sunoTaskId/audioId — playback pago mas não pôde ser gerado (pedido anterior a este recurso).`);
            await updateDoc(orderRef, {
              playbackRequesting: false,
              playbackStatus: 'FAILED',
              playbackError: 'missing_track_reference',
            }).catch((e) => console.warn(e.message));
          }
        }
      } catch (err) {
        console.warn('[payments] Erro ao disparar geração de playback:', err.message);
      }
    }

    // Carta Virtual: mesma reserva sequencial do playback, pelo mesmo motivo (webhook e polling do
    // pagamento podem chegar juntos e gerar duas vezes). Diferente do playback, aqui não há tarefa
    // assíncrona externa — o texto sai na própria chamada, então já grava pronto. Se falhar, o
    // cliente ainda pode gerar pelo botão em /entrega (api/carta/generate), então não é perda.
    if (txResult.isCartaOnly) {
      try {
        let shouldGenerate = false;
        const freshSnap = await getDoc(orderRef);
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          if (!freshData.cartaTexto && !freshData.cartaGenerating) {
            await updateDoc(orderRef, { cartaGenerating: true });
            shouldGenerate = true;
          }
        }

        if (shouldGenerate) {
          const { generateCartaText } = await import('./carta.js');
          const resultado = await generateCartaText(txResult.orderData || {});
          if (resultado.ok) {
            await updateDoc(orderRef, {
              cartaTexto: resultado.texto,
              cartaStatus: 'READY',
              cartaGeneratedAt: new Date().toISOString(),
              cartaGenerating: false,
            });
          } else {
            console.warn(`[payments] Carta paga mas não gerada — pedido ${orderId}:`, resultado.error);
            await updateDoc(orderRef, { cartaGenerating: false, cartaStatus: 'FAILED' });
          }
        }
      } catch (err) {
        console.warn('[payments] Erro ao gerar a carta:', err.message);
        await updateDoc(orderRef, { cartaGenerating: false }).catch(() => {});
      }
    }

    // Reserva com o mesmo padrão do WhatsApp (getDoc fresco + updateDoc antes de enviar) — sem isso,
    // chamadas concorrentes de applyPaymentApproval (webhook + polling + os dois crons de
    // reconciliação, que hoje rodam em paralelo) podiam todas passar pela checagem de idempotência
    // ANTES de qualquer updateDoc acontecer, e cada uma disparava seu próprio evento de Purchase pra
    // Meta — a escrita em si é idempotente (resultado final correto), mas o efeito colateral não era
    // (achado real em produção: 2 vendas genuínas geraram 15 eventos de Compra em ~5h, 19-20/08/2026).
    const sentField = txResult.isVideoOnly ? 'metaVideoPurchaseSent' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSent' : txResult.isCartaOnly ? 'metaCartaPurchaseSent' : 'metaPurchaseSent';
    const sendingField = txResult.isVideoOnly ? 'metaVideoPurchaseSending' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSending' : txResult.isCartaOnly ? 'metaCartaPurchaseSending' : 'metaPurchaseSending';
    try {
      let shouldSend = false;
      const freshSnap = await getDoc(orderRef);
      if (freshSnap.exists()) {
        const freshData = freshSnap.data();
        if (!freshData[sentField] && !freshData[sendingField]) {
          await updateDoc(orderRef, { [sendingField]: true });
          shouldSend = true;
        }
      }

      if (shouldSend) {
        // Mesmo cuidado do SKU: `expectedAmount` guarda só a última cobrança criada, então usar o
        // valor registrado PARA ESTE txid evita reportar à Meta a receita do produto errado quando a
        // aprovação chega de uma cobrança anterior (ver comentário do SKU, achado 30/08/2026).
        const amountByTxid = txResult.orderData?.paymentIntentAmountByTxid || {};
        const amountForThisTxid = Number(amountByTxid[String(paymentId)]);
        const value = amountForThisTxid
          || Number(payment.transaction_amount)
          || getPriceForSku(txResult.sku)
          || Number(txResult.orderData?.expectedAmount);
        const contentName = txResult.isVideoOnly
          ? 'Vídeo Homenagem (Add-on)'
          : txResult.isPlaybackOnly ? 'Playback Instrumental (Add-on)'
          : txResult.isCartaOnly ? 'Carta Virtual (Add-on)' : 'Música Homenagem Personalizada';
        const sendResult = await sendMetaPurchaseEvent({
          orderId,
          value,
          contentName,
          customerPhone: txResult.orderData?.customerPhone,
          customerEmail: txResult.orderData?.customerEmail,
        }, env);

        if (sendResult.sent) {
          await updateDoc(orderRef, { [sentField]: true, [sendingField]: false })
            .catch((e) => console.warn('[payments] Erro ao marcar Purchase enviado:', e.message));
        } else {
          await updateDoc(orderRef, { [sendingField]: false }).catch((e) => console.warn(e.message));
          console.warn(`[payments] Falha ao enviar Purchase (Meta CAPI) — pedido ${orderId}:`, sendResult.reason);
        }
      }
    } catch (err) {
      console.warn('[payments] Erro ao enviar evento de Purchase (Meta CAPI):', err.message);
    }
  }

  const { orderData: _omit, ...publicResult } = txResult;
  return publicResult;
}

// Exportada para permitir reenvio manual pelo admin (api/admin/notify-payment-approved) quando o
// pedido é aprovado manualmente no painel — updateDoc direto do browser (admin/pedidos/[id]/page.jsx)
// não passa por applyPaymentApproval, então o WhatsApp automático nunca dispararia sem isso.
export async function notifyPaymentApproved(orderRef, orderData, opts = {}) {
  if (!orderData?.customerPhone) return;
  // REGRA ANTI-BAN: só manda mensagem de "pagamento aprovado" pra quem já iniciou conversa pelo
  // WhatsApp (whatsappRequested === true) — mesma regra de src/lib/db.js:notifyMusicReady e
  // src/app/api/cron/recover/route.js. force=true (reenvio manual do admin) ignora a checagem —
  // decisão humana deliberada, não mensagem fria automática.
  if (!opts.force && !orderData.whatsappRequested) return;

  try {
    let shouldSend = false;
    const snap = await getDoc(orderRef);
    let freshData = {};
    if (snap.exists()) {
      freshData = snap.data();
      if (!freshData.paymentWhatsappSent && !freshData.paymentWhatsappSending) {
        await updateDoc(orderRef, { paymentWhatsappSending: true });
        shouldSend = true;
      }
    }

    if (!shouldSend) return;

    const mergedData = { ...orderData, ...freshData };
    const { sendPaymentApprovedTemplate, isVideoPurchased } = await import('./whatsapp.js');
    const deliveryUrl = resolveDeliveryUrl(orderRef.id);
    // Prioriza quem de fato escreveu no WhatsApp sobre o telefone digitado no formulário do site —
    // podem ser números diferentes (ver incidente 25/08/2026, mesma correção de src/lib/db.js).
    const targetPhone = mergedData.whatsappSenderPhone || mergedData.customerPhone;
    const sendResult = await sendPaymentApprovedTemplate(targetPhone, {
      customerName: mergedData.customerName,
      honoreeName: mergedData.honoreeName,
      deliveryUrl,
      // audioFiles já inclui audioUrl como primeiro item (ver src/lib/db.js:updateTaskResult) —
      // audioUrl só como fallback pra pedidos antigos sem audioFiles gravado.
      audioUrls: (mergedData.audioFiles?.length ? mergedData.audioFiles : [mergedData.audioUrl]).filter(Boolean),
      hasVideoAccess: isVideoPurchased(mergedData),
      orderData: mergedData,
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
    } else if (String(orderData.playbackPaymentId || '') === String(paymentId)) {
      updates.hasPlaybackAccess = false;
      updates.playbackAddonPaid = false;
      revoked = true;
    } else if (String(orderData.cartaPaymentId || '') === String(paymentId)) {
      updates.hasCartaAccess = false;
      updates.cartaAddonPaid = false;
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
