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

function extractNumberedAudioTracks(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const tracks = [];
  // Procura por chaves como audio_url1, audio_url2, audioUrl1, audioUrl2, etc. (padrão Unifically)
  for (let i = 1; i <= 10; i++) {
    const url = obj[`audio_url${i}`] || obj[`audioUrl${i}`] || obj[`audio_${i}`];
    if (typeof url === 'string' && url.trim()) {
      const u = url.trim();
      const uuidMatch = u.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      tracks.push({
        id: (uuidMatch && uuidMatch[1]) ? uuidMatch[1] : `${obj.task_id || obj.taskId || 'track'}-${i}`,
        audio_url: u,
        audioUrl: u,
        trackId: (uuidMatch && uuidMatch[1]) ? uuidMatch[1] : `${obj.task_id || obj.taskId || ''}-${i}`,
        imageUrl: obj.image_url || obj.imageUrl || '',
      });
    }
  }
  return tracks.length > 0 ? tracks : null;
}

export const extractAudioTracks = (result) => {
  if (!result) return [];
  
  let rawTracks = [];
  if (Array.isArray(result)) {
    rawTracks = result;
  } else if (Array.isArray(result.data)) {
    rawTracks = result.data;
  } else if (result.data && typeof result.data === 'object') {
    const d = result.data;
    rawTracks = extractNumberedAudioTracks(d)
      || extractNumberedAudioTracks(d.output)
      || d.response?.sunoData
      || d.response?.tracks
      || d.sunoData
      || d.tracks
      || d.output?.audio_urls
      || d.output?.audios
      || (d.output?.audio_url ? [d.output] : null)
      || d.audio_urls
      || (d.audio_url ? [d] : null)
      || [d];
  } else if (result.response && (result.response.sunoData || result.response.tracks)) {
    rawTracks = result.response.sunoData || result.response.tracks;
  } else if (result.output && typeof result.output === 'object') {
    rawTracks = extractNumberedAudioTracks(result.output)
      || result.output.audio_urls
      || result.output.audios
      || (result.output.audio_url ? [result.output] : null)
      || [result.output];
  } else if (result.tracks) {
    rawTracks = result.tracks;
  } else if (result.audio_urls && Array.isArray(result.audio_urls)) {
    rawTracks = result.audio_urls;
  } else if (extractNumberedAudioTracks(result)) {
    rawTracks = extractNumberedAudioTracks(result);
  } else if (result.audio_url) {
    rawTracks = [result];
  }

  const tracks = Array.isArray(rawTracks) ? rawTracks : (rawTracks ? [rawTracks] : []);

  return tracks.map(t => {
    if (!t) return null;
    if (typeof t === 'string') {
      return { audio_url: t, audioUrl: t };
    }

    const rawCandidates = [
      t.audio_url, t.audioUrl,
      t.audio_url1, t.audioUrl1,
      t.audio_url2, t.audioUrl2,
      t.source_audio_url, t.sourceAudioUrl,
      t.stream_audio_url, t.streamAudioUrl,
      t.sourceStreamAudioUrl, t.source_stream_audio_url
    ].filter((u) => typeof u === 'string' && u.trim());

    const uuidMatch = rawCandidates.join(' ').match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const trackId = (t.trackId && /^[a-f0-9-]{36}$/i.test(t.trackId))
      ? t.trackId
      : (t.id && /^[a-f0-9-]{36}$/i.test(t.id))
        ? t.id
        : (uuidMatch ? uuidMatch[1] : (t.id || t.trackId || ''));

    const isUnifically = rawCandidates.some(u => u.includes('unifically.com'));

    const hasStream = rawCandidates.some(u => u.includes('audiostream.kie.ai') || u.includes('stream'));
    const streamCandidate = (!isUnifically && trackId && (hasStream || rawCandidates.length > 0) && /^[a-f0-9-]{36}$/i.test(trackId))
      ? `https://audiostream.kie.ai/stream/${trackId}.mp3`
      : '';

    const urlCandidates = [
      t.stream_audio_url, t.streamAudioUrl,
      streamCandidate,
      t.audio_url, t.audioUrl,
      t.audio_url1, t.audioUrl1,
      t.audio_url2, t.audioUrl2,
      t.source_audio_url, t.sourceAudioUrl,
    ].filter((u) => typeof u === 'string' && u.trim());

    let url = '';
    if (isUnifically) {
      url = urlCandidates.find(u => u.includes('unifically.com')) || urlCandidates[0] || '';
    } else {
      url = urlCandidates.find((u) => u.includes('audiostream.kie.ai'))
        || urlCandidates.find((u) => !u.includes('musicfile.kie.ai') && !u.includes('tempfile.aiquickdraw.com'))
        || urlCandidates.find((u) => !u.includes('musicfile.kie.ai'))
        || urlCandidates[0] || '';

      if (!url && trackId) {
        url = `https://cdn1.suno.ai/${trackId}.mp3`;
      }
    }

    const imageUrl = t.image_url || t.imageUrl || t.cover_image_url || t.coverImageUrl || '';

    return {
      ...t,
      audio_url: url,
      audioUrl: url,
      trackId: trackId || '',
      imageUrl,
    };
  }).filter(t => t && t.audio_url);
};

export const updateTaskResult = async (taskId, result, overrideOrderId = null, env = {}) => {
  try {
    let orderId = overrideOrderId;
    if (!orderId) {
      const task = await getSunoTask(taskId, env);
      if (task?.orderId) {
        orderId = task.orderId;
      }
    }

    await saveSunoTask(taskId, 'COMPLETED', result, orderId || null, {}, env);

    const tracks = extractAudioTracks(result);

    if (orderId && tracks.length > 0) {
      const primaryAudio = tracks[0].audio_url;
      const audioFiles = tracks.map(t => t.audio_url).filter(Boolean);
      const audioIds = tracks.map(t => t.trackId).filter(Boolean);

      const orderData = (await getOrder(orderId, env)) || {};

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

      const isRegeracao = isAguardandoNovaGeracao || isNovoTrack || isNovaTarefa;
      const isMesmaMusicaJaArquivada = orderTemAudioNosso && !isRegeracao;

      const updates = {
        audioUrl: isMesmaMusicaJaArquivada ? orderData.audioUrl : primaryAudio,
        audioFiles: isMesmaMusicaJaArquivada ? orderData.audioFiles : audioFiles,
        audioIds: audioIds.length > 0 ? audioIds : (orderData.audioIds || []),
        productionStatus: 'AUDIO_GERADO',
        sunoTaskId: taskId,
        updatedAt: new Date().toISOString()
      };

      if (!isMesmaMusicaJaArquivada) {
        updates.audioArchivedAt = null;
        updates.audioArchiveFailedAt = null;
        updates.audioArchiving = false;
      }

      if (!orderData.coverUrl && tracks[0]?.imageUrl) {
        updates.coverUrl = tracks[0].imageUrl;
      }

      if (!orderData.lyrics && tracks[0]?.prompt) {
        updates.lyrics = tracks[0].prompt;
      }

      await updateOrder(orderId, updates, env);
      console.log(`Ordem ${orderId} atualizada com sucesso com ${audioFiles.length} áudios!`);

      let archiveResult = null;
      if (!isMesmaMusicaJaArquivada) {
        try {
          const { arquivarAudioDoPedido } = await import('./audioArchive.js');
          archiveResult = await arquivarAudioDoPedido({ orderId, env });
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
      }

      const jaTinhaAudio = Boolean(orderData.audioUrl || orderData.audioFiles?.length);
      if (!jaTinhaAudio) {
        const { addGeneration } = await import('./liveStats.js');
        await addGeneration();
      }

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
  if (!force) {
    try {
      const freshData = await getOrder(orderId, env);
      if (freshData) {
        if (!freshData.whatsappSent && !freshData.readyTemplateSent && !freshData.whatsappSending && !freshData.readyTemplateSending) {
          await updateOrder(orderId, { whatsappSending: true, readyTemplateSending: true }, env);
          shouldSend = true;
        }
      }
    } catch (txErr) {
      console.warn("Erro ao reservar o envio de WhatsApp:", txErr);
    }
  }

  if (!shouldSend) return { sent: false, reason: 'already_sending' };

  const deliveryUrl = resolveDeliveryUrl(orderId);
  const targetPhone = currentOrder.whatsappSenderPhone || currentOrder.customerPhone;
  const sendResult = await sendMusicReadyTemplate(targetPhone, {
    customerName: currentOrder.customerName,
    honoreeName: currentOrder.honoreeName,
    deliveryUrl,
  }, env);

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
