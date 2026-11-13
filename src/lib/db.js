import { getOrder, updateOrder, getSunoTask, saveSunoTask } from './supabaseDb.js';
import { sendMusicReadyTemplate } from './whatsapp.js';
import { resolveDeliveryUrl } from './whatsappTemplates.js';

export const getTask = async (taskId, env = {}) => {
  if (!taskId) return null;
  return getSunoTask(taskId, env);
};

/**
 * Salva ou atualiza uma tarefa da Suno no Supabase.
 * @param {string} taskId
 * @param {string} status
 * @param {object} [result]
 * @param {string} [orderId]
 * @param {object} [extra]
 * @param {object} [env]
 */
export const saveTask = async (taskId, status, result = null, orderId = null, extra = {}, env = {}) => {
  return saveSunoTask(taskId, status, result, orderId, extra, env);
};

import { extractAudioTracks } from './audioTracks.js';
export { extractAudioTracks };

export const updateTaskResult = async (taskId, result, overrideOrderId = null, env = {}) => {
  try {
    let orderId = overrideOrderId;
    if (!orderId) {
      const task = await getSunoTask(taskId, env);
      if (task?.orderId) {
        orderId = task.orderId;
      }
    }

    if (!orderId) {
      try {
        const { getSupabaseEdge } = await import('./supabase-edge.js');
        const supabase = getSupabaseEdge(env);
        if (supabase) {
          const { data: ordRow } = await supabase
            .from('orders')
            .select('id')
            .eq('suno_task_id', taskId)
            .maybeSingle();
          if (ordRow?.id) {
            orderId = ordRow.id;
          }
        }
      } catch (e) {}
    }

    await saveSunoTask(taskId, 'COMPLETED', result, orderId || null, {}, env);

    const tracks = extractAudioTracks(result);

    if (orderId && tracks.length > 0) {
      const primaryAudio = tracks[0].audio_url;
      const audioFiles = tracks.map(t => t.audio_url).filter(Boolean);
      const audioIds = tracks.map(t => t.trackId).filter(Boolean);

      const orderData = (await getOrder(orderId, env)) || {};

      // D04: Proteção contra corridas de tarefas antigas sobrepostas
      let isOlderTask = false;
      const historyHasTask = Array.isArray(orderData.audioHistory) &&
        orderData.audioHistory.some(h => h.taskId === taskId && !h.active);

      // Só pode ser considerada tarefa defasada se o pedido JÁ POSSUI áudio ativo gravado
      const jaTemAudioAtivo = Boolean(orderData.audioUrl || (Array.isArray(orderData.audioFiles) && orderData.audioFiles.length > 0));

      if (historyHasTask && jaTemAudioAtivo) {
        isOlderTask = true;
      } else if (orderData.sunoTaskId && orderData.sunoTaskId !== taskId && jaTemAudioAtivo) {
        if (orderData.productionStatus === 'GERANDO_AUDIO') {
          // O pedido está gerando ativamente orderData.sunoTaskId; este callback de outro taskId é defasado
          isOlderTask = true;
        } else {
          // Checar se taskId foi criado antes da tarefa atual
          try {
            const incomingTask = await getTask(taskId, env);
            const currentTask = await getTask(orderData.sunoTaskId, env);
            const incomingTime = incomingTask?.createdAt || incomingTask?.updatedAt;
            const currentTime = currentTask?.createdAt || currentTask?.updatedAt || orderData.sunoRequestedAt;
            if (incomingTime && currentTime && new Date(incomingTime) < new Date(currentTime)) {
              isOlderTask = true;
            }
          } catch (e) {}
        }
      }

      if (isOlderTask) {
        console.log(`[db] Callback da tarefa defasada ${taskId} recebido para pedido ${orderId}. Gravando apenas no histórico sem alterar áudio ativo.`);
        const { appendAudioHistory } = await import('./audioHistory.js');
        const updatedHistory = appendAudioHistory(orderData, tracks, taskId, 'suno');
        const nonActiveHistory = (updatedHistory || []).map(h => (h.taskId === taskId ? { ...h, active: false } : h));
        await updateOrder(orderId, {
          audioHistory: nonActiveHistory,
          updatedAt: new Date().toISOString()
        }, env);
        return;
      }

      const { isOurStorage } = await import('./audioArchive.js');
      const orderTemAudioNosso = isOurStorage(orderData.audioUrl)
        || (Array.isArray(orderData.audioFiles) && orderData.audioFiles.length > 0 && isOurStorage(orderData.audioFiles[0]));

      const isNovoTrack = Boolean(
        audioIds.length > 0 &&
        Array.isArray(orderData.audioIds) &&
        orderData.audioIds.length > 0 &&
        orderData.audioIds[0] !== audioIds[0]
      );

      const isAguardandoNovaGeracao = orderData.productionStatus === 'GERANDO_AUDIO' || orderData.productionStatus === 'EM_PRODUCAO';
      const isNovaTarefa = Boolean(orderData.sunoTaskId && orderData.sunoTaskId !== taskId);
      const incomingIsFinalizedNonStream = Boolean(
        primaryAudio &&
        !primaryAudio.includes('audiostream.kie.ai') &&
        !isOurStorage(primaryAudio)
      );
      const wasArchivedFromStream = Boolean(orderData.audioArchivedFromStream || orderData.extras?.audioArchivedFromStream);
      const shouldUpgradeFromStream = Boolean(wasArchivedFromStream && incomingIsFinalizedNonStream);

      const isRegeracao = isAguardandoNovaGeracao || isNovoTrack || isNovaTarefa || shouldUpgradeFromStream;
      const isMesmaMusicaJaArquivada = orderTemAudioNosso && !isRegeracao;

      const { appendAudioHistory } = await import('./audioHistory.js');
      const updatedHistory = appendAudioHistory(orderData, tracks, taskId, 'suno');

      const updates = {
        audioUrl: isMesmaMusicaJaArquivada ? orderData.audioUrl : primaryAudio,
        audioFiles: isMesmaMusicaJaArquivada ? orderData.audioFiles : audioFiles,
        audioIds: audioIds.length > 0 ? audioIds : (orderData.audioIds || []),
        audioHistory: updatedHistory,
        productionStatus: 'AUDIO_GERADO',
        sunoTaskId: taskId,
        updatedAt: new Date().toISOString()
      };

      if (!isMesmaMusicaJaArquivada) {
        updates.audioArchivedAt = null;
        updates.audioArchiveFailedAt = null;
        updates.audioArchiving = false;
        updates.audioArchivedFromStream = false;
      }

      if (!orderData.coverUrl && tracks[0]?.imageUrl) {
        updates.coverUrl = tracks[0].imageUrl;
      }

      if (!orderData.lyrics && tracks[0]?.prompt) {
        updates.lyrics = tracks[0].prompt;
      }

      await updateOrder(orderId, updates, env);
      console.log(`Ordem ${orderId} atualizada com sucesso com ${audioFiles.length} áudios!`);

      // Se este pedido for uma 2ª geração, conclui o consumo no pedido pai agora que a música foi de fato gerada!
      const parentIdToUpdate = orderData.parentOrderId || orderData.extras?.parentOrderId || orderData.orderRef || orderData.extras?.orderRef;
      if (parentIdToUpdate && (orderData.isSecondGeneration || orderData.origem === 'segunda_geracao' || orderData.origem === 'segunda_musica' || orderData.paidSku === 'segunda_geracao_bonus')) {
        try {
          await updateOrder(parentIdToUpdate, {
            segundaGeracaoUsada: true,
            segundaGeracaoUsadaAt: new Date().toISOString(),
            secondGenerationOrderId: orderId,
            segundaGeracaoOrderId: orderId,
          }, env);
          console.log(`[db] 2ª geração concluída: pedido pai ${parentIdToUpdate} marcado como segundaGeracaoUsada.`);
        } catch (parentErr) {
          console.warn('[db] Falha ao marcar segundaGeracaoUsada no pedido pai:', parentErr?.message);
        }
      }

      let archiveResult = null;
      if (!isMesmaMusicaJaArquivada) {
        try {
          const { arquivarAudioDoPedido } = await import('./audioArchive.js');
          archiveResult = await arquivarAudioDoPedido({ orderId, env, forceOverwrite: shouldUpgradeFromStream });
        } catch (err) {
          console.warn('[db] Falha ao arquivar áudio na chegada:', err.message);
        }
      }

      const finalUpdates = { ...updates };
      if (archiveResult?.files?.length) {
        finalUpdates.audioFiles = archiveResult.files;
        finalUpdates.audioUrl = archiveResult.files[0];
        if (archiveResult.arquivou) {
          finalUpdates.audioArchivedAt = new Date().toISOString();
        }

        if (Array.isArray(updatedHistory)) {
          finalUpdates.audioHistory = updatedHistory.map((ver) => {
            if (ver.taskId === taskId) {
              return {
                ...ver,
                tracks: (ver.tracks || []).map((tr, idx) => ({
                  ...tr,
                  audioUrl: archiveResult.files[idx] || tr.audioUrl,
                  audio_url: archiveResult.files[idx] || tr.audio_url
                }))
              };
            }
            return ver;
          });
          await updateOrder(orderId, {
            audioHistory: finalUpdates.audioHistory,
            audioFiles: finalUpdates.audioFiles,
            audioUrl: finalUpdates.audioUrl,
            audioArchivedAt: finalUpdates.audioArchivedAt
          }, env).catch(() => {});
        }
      }

      const jaTinhaAudio = Boolean(orderData.audioUrl || orderData.audioFiles?.length);
      if (!jaTinhaAudio) {
        const { addGeneration } = await import('./liveStats.js');
        await addGeneration();
      }

      // Envia notificação oficial avisando que a música ficou pronta com o link do pedido
      await notifyMusicReady(orderId, null, orderId, {}, env);
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};

/**
 * Envia o WhatsApp de "música pronta", com reserva de idempotência.
 */
export const notifyMusicReady = async (orderRefOrId, orderData, orderIdParam, opts = {}, env = {}) => {
  const force = Boolean(opts.force);
  const orderId = orderIdParam || (typeof orderRefOrId === 'string' ? orderRefOrId : orderRefOrId?.id);
  if (!orderId) return { sent: false, reason: 'no_order_id' };

  const currentOrder = orderData || await getOrder(orderId, env);
  if (!currentOrder?.customerPhone) return { sent: false, reason: 'no_phone' };
  if (!force && (currentOrder.whatsappSent || currentOrder.readyTemplateSent)) return { sent: false, reason: 'already_sent' };
  if (!force && !currentOrder.whatsappRequested && !currentOrder.customerPhone) return { sent: false, reason: 'not_requested' };

  let shouldSend = force;
  let freshData = null;
  if (!force) {
    try {
      freshData = await getOrder(orderId, env);
      if (freshData) {
        const isSendingStale = (freshData.whatsappSending || freshData.readyTemplateSending) &&
          freshData.whatsappSendingAt &&
          (Date.now() - new Date(freshData.whatsappSendingAt).getTime() > 120000);

        const isNotSent = !freshData.whatsappSent && !freshData.readyTemplateSent;
        const isNotSendingOrStale = (!freshData.whatsappSending && !freshData.readyTemplateSending) || isSendingStale;

        if (isNotSent && isNotSendingOrStale) {
          await updateOrder(orderId, {
            whatsappSending: true,
            readyTemplateSending: true,
            whatsappSendingAt: new Date().toISOString()
          }, env);
          shouldSend = true;
        }
      }
    } catch (txErr) {
      console.warn("Erro ao reservar o envio de WhatsApp:", txErr);
    }
  }

  if (!shouldSend) return { sent: false, reason: 'already_sending' };

  const finalOrder = freshData || currentOrder;
  const deliveryUrl = resolveDeliveryUrl(orderId);
  const targetPhone = finalOrder.whatsappSenderPhone || finalOrder.customerPhone;

  const sendResult = await sendMusicReadyTemplate(targetPhone, {
    customerName: finalOrder.customerName,
    honoreeName: finalOrder.honoreeName,
    deliveryUrl,
    orderData: finalOrder,
  }, env);

  if (sendResult.ignored) {
    await updateOrder(orderId, { whatsappSending: false, readyTemplateSending: false }, env).catch(() => {});
    console.log(`Mensagem do WhatsApp (música pronta) ignorada pela trava (${sendResult.ignored}) — pedido ${orderId}`);
    return { sent: false, reason: sendResult.ignored };
  }

  if (sendResult.success) {
    await updateOrder(orderId, {
      whatsappSent: true,
      readyTemplateSent: true,
      whatsappSentAt: new Date().toISOString(),
      readyTemplateSentAt: new Date().toISOString(),
      whatsappSending: false,
      readyTemplateSending: false,
    }, env).catch(e => console.warn("Erro ao atualizar whatsappSent:", e));
    console.log(`Mensagem do WhatsApp (música pronta) enviada com sucesso — pedido ${orderId}`);
    return { sent: true };
  }

  await updateOrder(orderId, { whatsappSending: false, readyTemplateSending: false }, env).catch(e => console.warn(e));
  console.warn(`Falha ao enviar WhatsApp (música pronta) — pedido ${orderId}`);
  return { sent: false, reason: sendResult.error || 'send_failed' };
};
