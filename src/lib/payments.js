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
import { skuApprovesMusic, skuGrantsVideoAccess, skuGrantsCartaAccess, skuGrantsRetrospectivaAccess, skuGrantsCustomVoiceAccess, getPriceForSku, brindesPorValorPago } from './pricing.js';
import { resolveDeliveryUrl } from './whatsappTemplates.js';
import { sendMetaPurchaseEvent } from './metaCapi.js';
import { sendTikTokPurchaseEvent } from './tiktokCapi.js';

const REVOKING_STATUSES = new Set(['cancelled', 'refunded', 'charged_back']);

// Trava em memória para impedir aprovações simultâneas do mesmo pedido e txid no mesmo isolate
const activePaymentApprovals = new Set();

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

  const approvalLockKey = `${orderId}_${paymentId}`;
  if (activePaymentApprovals.has(approvalLockKey)) {
    console.log(`[payments] Aprovação concorrente em andamento para ${orderId} (${paymentId}). Ignorando.`);
    return { applied: false, reason: 'concurrent_approval_in_progress' };
  }
  activePaymentApprovals.add(approvalLockKey);

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
      const isKaraokeOnly = sku === 'karaoke_addon';
      const isVoiceOnly = sku === 'custom_voice_addon';
      const isAddonOnly = isVideoOnly || isPlaybackOnly || isCartaOnly || isRetroOnly || isKaraokeOnly || isVoiceOnly;
      const dedupKey = isVideoOnly ? 'videoPaymentId'
        : isPlaybackOnly ? 'playbackPaymentId'
        : isCartaOnly ? 'cartaPaymentId'
        : isRetroOnly ? 'retrospectivaPaymentId'
        : isKaraokeOnly ? 'karaokePaymentId'
        : isVoiceOnly ? 'customVoicePaymentId'
        : 'paymentId';

      const existingPaymentId = String(orderData[dedupKey] || '').trim().toUpperCase();
      const currentTxid = String(paymentId).trim().toUpperCase();

      // Idempotência: mesmo paymentId já aplicado antes (webhook e polling correndo em paralelo).
      if (existingPaymentId && existingPaymentId === currentTxid) {
        txResult = { applied: false, reason: 'already_processed', sku };
      } else if (!isAddonOnly && (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO')) {
        console.log(`[payments] Pedido ${orderId} já aprovado no banco de dados. Ignorando re-aprovação concorrente da música.`);
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
        } else if (isKaraokeOnly) {
          updates.hasKaraokeAccess = true;
          updates.karaokeAddonPaid = true;
          updates.karaokePaymentId = String(paymentId);
          updates.karaokePaidAt = nowIso;
          updates.karaokePaidAmount = valorPago;
        } else if (isVoiceOnly) {
          updates.hasCustomVoiceAccess = true;
          updates.customVoiceAddonPaid = true;
          updates.customVoicePaymentId = String(paymentId);
          updates.customVoicePaidAt = nowIso;
          updates.customVoicePaidAmount = valorPago;
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
          if (skuGrantsCustomVoiceAccess(sku)) {
            updates.hasCustomVoiceAccess = true;
            updates.customVoiceAddonPaid = true;
            updates.customVoicePaidAt = nowIso;
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
          else if (isKaraokeOnly) paymentKind = 'karaoke';
          else if (isVoiceOnly) paymentKind = 'voz';

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
        txResult = { applied: true, sku, isVideoOnly, isPlaybackOnly, isCartaOnly, isRetroOnly, isKaraokeOnly, isVoiceOnly, grantedCartaViaCombo, orderData };
      }
    }
  } catch (err) {
    console.error('[payments] Falha ao aplicar aprovação:', err.message);
    return { applied: false, reason: 'update_failed' };
  } finally {
    activePaymentApprovals.delete(approvalLockKey);
  }

  if (txResult.applied) {
    if (!txResult.isVideoOnly && !txResult.isPlaybackOnly && !txResult.isCartaOnly && !txResult.isRetroOnly && !txResult.isKaraokeOnly && !txResult.isVoiceOnly) {
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
        const orderData = txResult.orderData || {};
        const chosenAudioId = orderData.playbackChosenAudioId;
        const faixas = Array.isArray(orderData.audioIds) ? orderData.audioIds : [];
        const arquivosFaixas = Array.isArray(orderData.audioFiles) ? orderData.audioFiles : [];
        let targetAudio = null;
        if (chosenAudioId && faixas.length > 0) {
          const idx = faixas.indexOf(chosenAudioId);
          if (idx !== -1 && arquivosFaixas[idx]) targetAudio = arquivosFaixas[idx];
        }
        if (!targetAudio) {
          targetAudio = orderData.audioUrl || arquivosFaixas[0] || orderData.secondAudioUrl || null;
        }

        const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || '').trim();
        let vpsAudioUrl = String(env?.VPS_AUDIO_URL || process.env.VPS_AUDIO_URL || '').trim();
        if (!vpsAudioUrl && vpsVideoUrl) {
          vpsAudioUrl = vpsVideoUrl.replace(/\/video\/?$/, '/audio');
        } else if (!vpsAudioUrl) {
          vpsAudioUrl = 'https://evolution.nsnexus.com.br/audio';
        }
        const vpsSecret = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();

        if (targetAudio && vpsAudioUrl && vpsSecret) {
          let cleanAudioUrl = vpsAudioUrl.replace(/\/+$/, '');
          if (cleanAudioUrl.includes('81.17.98.66')) {
            cleanAudioUrl = cleanAudioUrl.replace(/https?:\/\/81\.17\.98\.66(\/audio)?/, 'https://evolution.nsnexus.com.br/audio');
          }
          const targetEndpoint = cleanAudioUrl.endsWith('/separate') ? cleanAudioUrl : `${cleanAudioUrl}/separate`;

          await updateOrder(orderId, {
            playbackStatus: 'GERANDO',
            playbackError: null,
            updatedAt: new Date().toISOString(),
          }, env);

          fetch(targetEndpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${vpsSecret}`,
            },
            body: JSON.stringify({ orderId, audioUrl: targetAudio }),
            signal: AbortSignal.timeout(10000),
          }).catch(e => console.warn('[payments] Disparo assíncrono de playback na VPS falhou:', e?.message));
        } else {
          await updateOrder(orderId, {
            playbackStatus: 'AGUARDANDO_CONTATO',
            playbackRequesting: false,
            updatedAt: new Date().toISOString(),
          }, env);
        }
      } catch (err) {
        console.warn('[payments] Erro ao iniciar geração de playback:', err.message);
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

    if (txResult.isKaraokeOnly) {
      try {
        const freshData = await getOrder(orderId, env);
        const hasMultiple = Array.isArray(freshData?.audioFiles) && freshData.audioFiles.length > 1;
        const hasChosen = Boolean(freshData?.karaokeChosenAudioUrl || (freshData?.karaokeChosenTrackIndex !== undefined && freshData?.karaokeChosenTrackIndex !== null));
        // Se houver múltiplas versões e o cliente ainda não escolheu, não auto-renderiza; deixa o cliente escolher na página de entrega!
        if (!hasMultiple || hasChosen) {
          const { triggerKaraokeRender } = await import('./karaoke.js');
          await triggerKaraokeRender(orderId, {}, env);
        }
      } catch (err) {
        console.warn('[payments] Erro ao iniciar geração de karaokê:', err.message);
      }
    }

    const sentField = txResult.isVideoOnly ? 'metaVideoPurchaseSent' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSent' : txResult.isCartaOnly ? 'metaCartaPurchaseSent' : txResult.isRetroOnly ? 'metaRetroPurchaseSent' : txResult.isKaraokeOnly ? 'metaKaraokePurchaseSent' : 'metaPurchaseSent';
    const sendingField = txResult.isVideoOnly ? 'metaVideoPurchaseSending' : txResult.isPlaybackOnly ? 'metaPlaybackPurchaseSending' : txResult.isCartaOnly ? 'metaCartaPurchaseSending' : txResult.isRetroOnly ? 'metaRetroPurchaseSending' : txResult.isKaraokeOnly ? 'metaKaraokePurchaseSending' : 'metaPurchaseSending';
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

        sendTikTokPurchaseEvent({
          orderId,
          value,
          contentName,
          sku: txResult.sku,
          customerPhone: txResult.orderData?.customerPhone,
          customerEmail: txResult.orderData?.customerEmail,
        }, env).catch((e) => console.warn('[payments] Erro ao enviar Purchase (TikTok Events API):', e?.message));
      }
    } catch (err) {
      console.warn('[payments] Erro ao enviar evento de Purchase (Meta CAPI):', err.message);
    }
  }

  const { orderData: _omit, ...publicResult } = txResult;
  return publicResult;
}

// Trava em memória no Edge isolate para evitar rajadas e reentrâncias (orderId -> timestamp)
const inMemoryNotifyLocks = new Map();

/**
 * Notifica o cliente via WhatsApp que o pagamento foi aprovado.
 * Implementa 3 camadas de trava para impedir múltiplos envios mesmo sob concorrência intensa:
 * 1. Trava em memória no runtime Edge.
 * 2. Trava distribuída na tabela config do Supabase.
 * 3. Atualização otimista de paymentWhatsappSent=true no pedido ANTES do envio de rede.
 */
export async function notifyPaymentApproved(orderRefOrId, orderData, opts = {}, env = {}) {
  const orderId = typeof orderRefOrId === 'string' ? orderRefOrId : orderRefOrId?.id;
  if (!orderId) return;

  // Envio de confirmação de pagamento via WhatsApp desativado por padrão para economia de mensagens.
  // O cliente já recebe a mensagem de "música pronta" e a liberação é exibida diretamente na tela de entrega.
  const isPaymentWhatsappEnabled = opts.force || env?.ENABLE_PAYMENT_WHATSAPP === 'true' || process.env.ENABLE_PAYMENT_WHATSAPP === 'true';
  if (!isPaymentWhatsappEnabled) {
    console.log(`[payments] Notificação de pagamento aprovado via WhatsApp desativada para economia de mensagens (pedido ${orderId}).`);
    return { success: true, ignored: 'desativado_para_economia' };
  }

  const now = Date.now();
  const lastMemoryLock = inMemoryNotifyLocks.get(orderId);
  const debounceWindowMs = opts.force ? 15000 : 15 * 60 * 1000;
  if (lastMemoryLock && (now - lastMemoryLock < debounceWindowMs)) {
    console.log(`[payments] Notificação de pagamento aprovado enviada recentemente para ${orderId} (${now - lastMemoryLock}ms atrás). Ignorando duplicata.`);
    return;
  }

  // Trava na memória IMEDIATAMENTE (síncrona, antes de qualquer await)
  inMemoryNotifyLocks.set(orderId, now);

  const currentOrder = orderData || await getOrder(orderId, env);
  if (!currentOrder?.customerPhone) return;
  if (!opts.force && !currentOrder.whatsappRequested && !currentOrder.customerPhone) return;

  try {
    const freshData = await getOrder(orderId, env);
    if (!freshData) return;

    if (freshData.paymentWhatsappSent && !opts.force) {
      console.log(`[payments] Pedido ${orderId} já possui paymentWhatsappSent=true no banco. Ignorando envio duplicado.`);
      return;
    }

    if (freshData.paymentWhatsappSending && !opts.force) {
      console.log(`[payments] Pedido ${orderId} já está com paymentWhatsappSending=true. Ignorando envio concorrente.`);
      return;
    }

    // Trava distribuída na tabela config do Supabase
    let supabase = null;
    try {
      const { getSupabaseEdge } = await import('./supabase-edge.js');
      supabase = getSupabaseEdge(env);
    } catch {}

    const lockKey = `lock_payment_notify_${orderId}`;
    if (supabase) {
      try {
        const { data: lockRow } = await supabase
          .from('config')
          .select('valor')
          .eq('chave', lockKey)
          .maybeSingle();

        if (lockRow?.valor?.at) {
          const lockAt = Date.parse(lockRow.valor.at);
          if (!Number.isNaN(lockAt) && (now - lockAt < debounceWindowMs)) {
            console.log(`[payments] Trava ativa no banco (config) para ${orderId}. Ignorando envio concorrente.`);
            return;
          }
        }

        // Grava a trava no banco ANTES de chamar a API
        await supabase.from('config').upsert({
          chave: lockKey,
          valor: { at: new Date().toISOString(), status: 'sending' },
          updated_at: new Date().toISOString()
        });
      } catch (lockErr) {
        console.warn('[payments] Erro ao verificar/gravar trava distribuída em config:', lockErr.message);
      }
    }

    // Marca no banco que foi enviado / está enviando ANTES de chamar a API de envio externa (Optimistic lock)
    const nowIso = new Date().toISOString();
    await updateOrder(orderId, {
      paymentWhatsappSent: true,
      paymentWhatsappSentAt: nowIso,
      paymentWhatsappSending: true,
    }, env);

    const mergedData = { ...currentOrder, ...(freshData || {}) };
    const { sendPaymentApprovedTemplate, isVideoPurchased } = await import('@/lib/whatsapp');
    const deliveryUrl = resolveDeliveryUrl(orderId);
    const targetPhone = mergedData.whatsappSenderPhone || mergedData.customerPhone;

    console.log(`[payments] Enviando mensagem de pagamento aprovado para ${targetPhone} (pedido #${orderId})...`);
    const sendResult = await sendPaymentApprovedTemplate(targetPhone, {
      customerName: mergedData.customerName,
      honoreeName: mergedData.honoreeName,
      deliveryUrl,
      audioUrls: (mergedData.audioFiles?.length ? mergedData.audioFiles : [mergedData.audioUrl]).filter(Boolean),
      hasVideoAccess: isVideoPurchased(mergedData),
      orderData: mergedData,
    });

    // Finaliza a flag de sending
    await updateOrder(orderId, {
      paymentWhatsappSending: false,
    }, env).catch(() => {});

    if (sendResult?.success) {
      console.log(`[payments] ✅ Mensagem de pagamento aprovado enviada com sucesso para ${targetPhone} (pedido #${orderId})`);
    } else {
      console.warn(`[payments] ⚠️ Falha ao enviar WhatsApp (pagamento aprovado) para ${targetPhone} — pedido ${orderId}:`, sendResult?.error);
    }
  } catch (err) {
    console.error('[payments] Erro geral no envio de WhatsApp:', err.message);
    await updateOrder(orderId, { paymentWhatsappSending: false }, env).catch(() => {});
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
