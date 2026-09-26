// Ponto único de aprovação de pagamento, consumido por api/webhooks/efi e por api/payments/status
// (M-18 no AUDIT_REPORT.md — antes essa lógica estava duplicada e já tinha divergido entre os dois
// arquivos). Agnóstico de provedor: recebe um objeto normalizado { status, transaction_amount },
// hoje montado a partir da consulta à API Pix da Efí (antes, do Mercado Pago).
//
// Garante, nesta ordem:
//   - idempotência por paymentId via checagem sequencial getOrder + updateOrder (A-09);
//   - paymentStatus só é escrito quando o SKU realmente aprova a música (C-09), nunca no add-on isolado;
//   - o SKU vem do paymentIntent persistido em /api/payments/create, não de uma heurística de valor (A-13);
//   - estados de estorno/cancelamento revogam acesso já concedido, o que nunca era tratado antes.

import { getOrder, updateOrder } from './supabaseDb.js';
import { skuApprovesMusic, skuGrantsVideoAccess, skuGrantsCartaAccess, skuGrantsRetrospectivaAccess, getPriceForSku, brindesPorValorPago } from './pricing';
import { resolveDeliveryUrl } from './whatsappTemplates';
import { sendMetaPurchaseEvent } from './metaCapi';

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

  const status = payment.status;

  if (REVOKING_STATUSES.has(status)) {
    return revokeApproval(orderId, paymentId, status, env);
  }

  if (status !== 'approved') {
    return { applied: false, reason: 'not_approved', status };
  }

  let txResult;
  try {
    const orderData = await getOrder(orderId, env);
    if (!orderData) {
      txResult = { applied: false, reason: 'order_not_found' };
    } else {
      // O SKU tem que ser o da cobrança QUE ESTÁ SENDO PAGA (identificada pelo txid), não o da
      // última cobrança criada no pedido.
      const skuByTxid = orderData.paymentIntentSkuByTxid || {};
      const skuForThisTxid = skuByTxid[String(paymentId)];
      const hasIntentId = Boolean(orderData.paymentIntentId);
      const isCurrentIntent = !hasIntentId || String(orderData.paymentIntentId) === String(paymentId);

      const sku = skuForThisTxid
        || (isCurrentIntent ? orderData.paymentIntentSku : null)
        || (Math.abs(Number(payment.transaction_amount) - 6.90) < 0.01 ? 'video_addon' : 'audio_only');

      if (!skuForThisTxid && !isCurrentIntent) {
        console.warn(`[payments] txid sem SKU registrado e diferente do intent atual — SKU inferido por valor: ${sku}`);
      }

      const isVideoOnly = sku === 'video_addon';
      const isPlaybackOnly = sku === 'playback_addon';
      const isCartaOnly = sku === 'carta_addon';
      const isRetroOnly = sku === 'retrospectiva_addon';
      const dedupKey = isVideoOnly ? 'videoPaymentId'
        : isPlaybackOnly ? 'playbackPaymentId'
        : isCartaOnly ? 'cartaPaymentId'
        : isRetroOnly ? 'retrospectivaPaymentId'
        : 'paymentId';

      // Idempotência: mesmo paymentId já aplicado antes (webhook e polling correndo em paralelo).
      if (String(orderData[dedupKey] || '') === String(paymentId)) {
        txResult = { applied: false, reason: 'already_processed', sku };
      } else {
        const nowIso = new Date().toISOString();
        const updates = { updatedAt: nowIso };
        const valorPago = Number(payment.transaction_amount) || 0;

        if (isVideoOnly) {
          updates.hasVideoAccess = true;
          updates.videoAddonPaid = true;
          updates.videoPaymentId = String(paymentId);
          updates.videoPaidAt = nowIso;
          updates.videoPaidAmount = valorPago;
        } else if (isPlaybackOnly) {
          updates.hasPlaybackAccess = true;
          updates.playbackAddonPaid = true;
          updates.playbackPaymentId = String(paymentId);
          updates.playbackPaidAt = nowIso;
          updates.playbackPaidAmount = valorPago;
        } else if (isRetroOnly) {
          updates.hasRetrospectivaAccess = true;
          updates.retrospectivaAddonPaid = true;
          updates.retrospectivaPaymentId = String(paymentId);
          updates.retrospectivaPaidAt = nowIso;
          updates.retrospectivaPaidAmount = valorPago;
        } else if (isCartaOnly) {
          updates.hasCartaAccess = true;
          updates.cartaAddonPaid = true;
          updates.cartaPaymentId = String(paymentId);
          updates.cartaPaidAt = nowIso;
          updates.cartaPaidAmount = valorPago;
        } else {
          // C-09: paymentStatus só é escrito neste ramo — os add-ons isolados nunca o alteram.
          updates.paymentStatus = 'PAGAMENTO_APROVADO';
          updates.paymentId = String(paymentId);
          updates.paidAt = nowIso;
          updates.paidAmount = valorPago;
          updates.paidSku = sku || null;

          const brindes = sku === 'impacto' ? brindesPorValorPago(valorPago) : { carta: false, video: false, retrospectiva: false };

          if (skuGrantsVideoAccess(sku) || brindes.video) {
            updates.hasVideoAccess = true;
            updates.videoAddonPaid = true;
            updates.videoPaidAt = nowIso;
          }

          if (skuGrantsCartaAccess(sku) || brindes.carta) {
            updates.hasCartaAccess = true;
            updates.cartaAddonPaid = true;
            updates.cartaPaidAt = nowIso;
          }
          if (skuGrantsRetrospectivaAccess(sku) || brindes.retrospectiva) {
            updates.hasRetrospectivaAccess = true;
            updates.retrospectivaAddonPaid = true;
            updates.retrospectivaPaidAt = nowIso;
          }
        }

        await updateOrder(orderId, updates, env);

        // Registra transação na tabela payments do Supabase
        try {
          const { mirrorPaymentToSupabase } = await import('./supabaseSync.js');

          let paymentKind = 'musica';
          if (isVideoOnly) paymentKind = 'video';
          else if (isCartaOnly) paymentKind = 'carta';
          else if (isPlaybackOnly) paymentKind = 'playback';
          else if (isRetroOnly) paymentKind = 'retrospectiva';

          const confirmedAmount = Number(payment.transaction_amount) || getPriceForSku(sku) || 9.99;
          await mirrorPaymentToSupabase({
            orderId,
            kind: paymentKind,
            sku,
            txid: String(paymentId),
            amount: confirmedAmount,
            paidAt: nowIso
          }, env);
        } catch {}

        const grantedCartaViaCombo = skuGrantsCartaAccess(sku);
        txResult = { applied: true, sku, isVideoOnly, isPlaybackOnly, isCartaOnly, isRetroOnly, grantedCartaViaCombo, orderData };
      }
    }
  } catch (err) {
    console.error('[payments] Falha ao aplicar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  }

  if (txResult.applied) {
    if (!txResult.isVideoOnly && !txResult.isPlaybackOnly && !txResult.isCartaOnly && !txResult.isRetroOnly) {
      await notifyPaymentApproved(orderId, txResult.orderData, {}, env);

      // Contador de vendas da vitrine da home (stats/_live)
      try {
        const { addSale } = await import('./liveStats.js');
        await addSale();
      } catch (err) {
        console.warn('[payments] Falha ao somar venda no contador da home:', err.message);
      }

      // Arquiva o áudio no R2 assim que a música é aprovada
      try {
        let deveArquivar = false;
        let filesParaArquivar = [];
        const freshData = await getOrder(orderId, env);
        if (freshData) {
          filesParaArquivar = Array.isArray(freshData.audioFiles) && freshData.audioFiles.length
            ? freshData.audioFiles
            : [freshData.audioUrl].filter(Boolean);
          if (filesParaArquivar.length > 0 && !freshData.audioArchivedAt && !freshData.audioArchiving) {
            await updateOrder(orderId, { audioArchiving: true }, env);
            deveArquivar = true;
          }
        }

        if (deveArquivar) {
          const r2Bucket = env?.nsmusic_media;
          const r2PublicUrl = env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;

          if (r2Bucket && r2PublicUrl) {
            const files = filesParaArquivar;
            const { archiveAudioFiles } = await import('./audioArchive.js');
            const { files: archived, anyFailure } = await archiveAudioFiles(orderId, files, { r2Bucket, r2PublicUrl });

            const nowIso = new Date().toISOString();
            const archivePayload = {
              audioFiles: archived,
              audioUrl: archived[0],
              audioArchiving: false,
              ...(anyFailure
                ? { audioArchiveFailedAt: nowIso }
                : { audioArchivedAt: nowIso, audioArchiveFailedAt: null }),
            };
            await updateOrder(orderId, archivePayload, env);
          } else {
            console.warn('[payments] Nem R2 nem Storage configurados — áudio não arquivado.');
            await updateOrder(orderId, { audioArchiving: false }, env).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('[payments] Falha ao arquivar áudio:', err.message);
        await updateOrder(orderId, { audioArchiving: false }, env).catch(() => {});
      }
    }

    if (txResult.isPlaybackOnly) {
      try {
        await updateOrder(orderId, {
          playbackStatus: 'AGUARDANDO_CONTATO',
          playbackRequesting: false,
          updatedAt: new Date().toISOString(),
        }, env);
      } catch (err) {
        console.warn('[payments] Erro ao marcar playback como aguardando contato:', err.message);
      }
    }

    if (txResult.isCartaOnly || txResult.grantedCartaViaCombo) {
      try {
        let shouldGenerate = false;
        const freshData = await getOrder(orderId, env);
        if (freshData) {
          if (!freshData.cartaTexto && !freshData.cartaGenerating) {
            await updateOrder(orderId, { cartaGenerating: true }, env);
            shouldGenerate = true;
          }
        }

        if (shouldGenerate) {
          const { generateCartaText } = await import('./carta.js');
          const resultado = await generateCartaText(txResult.orderData || {});
          if (resultado.ok) {
            await updateOrder(orderId, {
              cartaTexto: resultado.texto,
              cartaStatus: 'READY',
              cartaGeneratedAt: new Date().toISOString(),
              cartaGenerating: false,
            }, env);
          } else {
            console.warn(`[payments] Carta paga mas não gerada — pedido ${orderId}:`, resultado.error);
            await updateOrder(orderId, { cartaGenerating: false, cartaStatus: 'FAILED' }, env);
          }
        }
      } catch (err) {
        console.warn('[payments] Erro ao gerar a carta:', err.message);
        await updateOrder(orderId, { cartaGenerating: false }, env).catch(() => {});
      }
    }

    const sentField = txResult.isVideoOnly ? 'metaVideoPurchaseSent' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSent' : txResult.isCartaOnly ? 'metaCartaPurchaseSent' : txResult.isRetroOnly ? 'metaRetroPurchaseSent' : 'metaPurchaseSent';
    const sendingField = txResult.isVideoOnly ? 'metaVideoPurchaseSending' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSending' : txResult.isCartaOnly ? 'metaCartaPurchaseSending' : txResult.isRetroOnly ? 'metaRetroPurchaseSending' : 'metaPurchaseSending';
    try {
      let shouldSend = false;
      const freshData = await getOrder(orderId, env);
      if (freshData) {
        if (!freshData[sentField] && !freshData[sendingField]) {
          await updateOrder(orderId, { [sendingField]: true }, env);
          shouldSend = true;
        }
      }

      if (shouldSend) {
        const amountByTxid = txResult.orderData?.paymentIntentAmountByTxid || {};
        const amountForThisTxid = Number(amountByTxid[String(paymentId)]);
        const value = amountForThisTxid
          || Number(payment.transaction_amount)
          || getPriceForSku(txResult.sku)
          || Number(txResult.orderData?.expectedAmount);
        const contentName = txResult.isVideoOnly
          ? 'Vídeo Homenagem (Add-on)'
          : txResult.isPlaybackOnly ? 'Playback Instrumental (Add-on)'
          : txResult.isCartaOnly ? 'Carta Virtual (Add-on)'
          : txResult.isRetroOnly ? 'Retrospectiva (Add-on)' : 'Música Homenagem Personalizada';
        const sendResult = await sendMetaPurchaseEvent({
          orderId,
          value,
          contentName,
          customerPhone: txResult.orderData?.customerPhone,
          customerEmail: txResult.orderData?.customerEmail,
        }, env);

        if (sendResult.sent) {
          await updateOrder(orderId, { [sentField]: true, [sendingField]: false }, env)
            .catch((e) => console.warn('[payments] Erro ao marcar Purchase enviado:', e.message));
        } else {
          await updateOrder(orderId, { [sendingField]: false }, env).catch((e) => console.warn(e.message));
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

/**
 * Notifica o cliente via WhatsApp que o pagamento foi aprovado.
 */
export async function notifyPaymentApproved(orderRefOrId, orderData, opts = {}, env = {}) {
  const orderId = typeof orderRefOrId === 'string' ? orderRefOrId : orderRefOrId?.id;
  if (!orderId) return;

  const currentOrder = orderData || await getOrder(orderId, env);
  if (!currentOrder?.customerPhone) return;
  if (!opts.force && !currentOrder.whatsappRequested) return;

  try {
    let shouldSend = false;
    const freshData = await getOrder(orderId, env);
    if (freshData) {
      if (!freshData.paymentWhatsappSent && !freshData.paymentWhatsappSending) {
        await updateOrder(orderId, { paymentWhatsappSending: true }, env);
        shouldSend = true;
      }
    }

    if (!shouldSend) return;

    const mergedData = { ...currentOrder, ...(freshData || {}) };
    const { sendPaymentApprovedTemplate, isVideoPurchased } = await import('./whatsapp.js');
    const deliveryUrl = resolveDeliveryUrl(orderId);
    const targetPhone = mergedData.whatsappSenderPhone || mergedData.customerPhone;
    const sendResult = await sendPaymentApprovedTemplate(targetPhone, {
      customerName: mergedData.customerName,
      honoreeName: mergedData.honoreeName,
      deliveryUrl,
      audioUrls: (mergedData.audioFiles?.length ? mergedData.audioFiles : [mergedData.audioUrl]).filter(Boolean),
      hasVideoAccess: isVideoPurchased(mergedData),
      orderData: mergedData,
    });

    if (sendResult.success) {
      await updateOrder(orderId, {
        paymentWhatsappSent: true,
        paymentWhatsappSentAt: new Date().toISOString(),
        paymentWhatsappSending: false,
      }, env).catch((e) => console.warn('[payments] Erro ao marcar WhatsApp enviado:', e.message));
    } else {
      await updateOrder(orderId, { paymentWhatsappSending: false }, env).catch((e) => console.warn(e.message));
      console.warn(`Falha ao enviar WhatsApp (pagamento aprovado) — pedido ${orderId}`);
    }
  } catch (err) {
    console.error('[payments] Erro geral no envio de WhatsApp:', err.message);
  }
}

async function revokeApproval(orderRefOrId, paymentId, status, env = {}) {
  const orderId = typeof orderRefOrId === 'string' ? orderRefOrId : orderRefOrId?.id;
  try {
    const orderData = await getOrder(orderId, env);
    if (!orderData) return { applied: false, reason: 'order_not_found', status };

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
    } else if (String(orderData.retrospectivaPaymentId || '') === String(paymentId)) {
      updates.hasRetrospectivaAccess = false;
      updates.retrospectivaAddonPaid = false;
      revoked = true;
    } else if (String(orderData.paymentId || '') === String(paymentId)) {
      updates.paymentStatus = 'AGUARDANDO_PAGAMENTO';
      revoked = true;

      const skuByTxid = orderData.paymentIntentSkuByTxid || {};
      const skuDaCobranca = skuByTxid[String(paymentId)] || orderData.paymentIntentSku || '';
      if (skuGrantsVideoAccess(skuDaCobranca)) {
        updates.hasVideoAccess = false;
        updates.videoAddonPaid = false;
      }
      if (skuGrantsCartaAccess(skuDaCobranca)) {
        updates.hasCartaAccess = false;
        updates.cartaAddonPaid = false;
      }
      if (skuGrantsRetrospectivaAccess(skuDaCobranca)) {
        updates.hasRetrospectivaAccess = false;
        updates.retrospectivaAddonPaid = false;
      }
    }

    if (revoked) await updateOrder(orderId, updates, env);
    return { applied: revoked, revoked, status };
  } catch (err) {
    console.error('[payments] Falha ao revogar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  }
}
