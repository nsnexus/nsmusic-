import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { sendMusicReadyTemplate } from './whatsapp.js';
import { resolveDeliveryUrl } from './whatsappTemplates.js';

export const getTask = async (taskId) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (err) {
    console.error("Error getting task:", err);
    return null;
  }
};

// Retorna se a gravação teve sucesso — o chamador (api/suno/generate) precisa saber, porque sem
// este documento o webhook/polling da Kie.ai nunca consegue achar o orderId de volta (taskId fica
// órfão) e o pedido trava sem que ninguém saiba que a ligação falhou.
export const saveTask = async (taskId, status, result = null, orderId = null) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    // merge:true padronizado com updateTaskResult (ver M-06 no AUDIT_REPORT.md) — sem isso, uma
    // chamada aqui depois de updateTaskResult já ter gravado o resultado apagaria os campos extras.
    await setDoc(docRef, {
      status,
      result,
      orderId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    return true;
  } catch (err) {
    console.error("Error saving task:", err);
    return false;
  }
};

export const extractAudioTracks = (result) => {
  if (!result) return [];
  
  let rawTracks = [];
  if (Array.isArray(result)) {
    rawTracks = result;
  } else if (Array.isArray(result.data)) {
    rawTracks = result.data;
  } else if (result.data && typeof result.data === 'object') {
    rawTracks = result.data.response?.sunoData || result.data.response?.tracks || result.data.sunoData || result.data.tracks || [result.data];
  } else if (result.response && (result.response.sunoData || result.response.tracks)) {
    rawTracks = result.response.sunoData || result.response.tracks;
  } else if (result.tracks) {
    rawTracks = result.tracks;
  }

  const tracks = Array.isArray(rawTracks) ? rawTracks : (rawTracks ? [rawTracks] : []);

  return tracks.map(t => {
    if (!t) return null;
    if (typeof t === 'string') {
      let u = t;
      if (u.includes('musicfile.kie.ai') && !u.endsWith('.mp3')) {
        u = `${u}.mp3`;
      }
      return { audio_url: u, audioUrl: u };
    }
    
    let url = t.audio_url || t.audioUrl || t.stream_audio_url || t.streamAudioUrl || t.source_audio_url || t.sourceAudioUrl || '';

    // Se a URL da Kie.ai não terminar com .mp3, adiciona .mp3 automaticamente
    if (url && url.includes('musicfile.kie.ai') && !url.endsWith('.mp3')) {
      url = `${url}.mp3`;
    }

    // Extrai o UUID da faixa para o proxy usar nas CDNs de fallback
    const trackId = t.id || (url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i) || [])[1];

    // Se não tem URL válida mas tem trackId, gera a URL da CDN do Suno como principal
    if (!url && trackId) {
      url = `https://cdn1.suno.ai/${trackId}.mp3`;
    }

    return {
      ...t,
      audio_url: url,
      audioUrl: url,
      trackId: trackId || ''
    };
  }).filter(t => t && t.audio_url);
};

export const updateTaskResult = async (taskId, result, overrideOrderId = null) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    let orderId = overrideOrderId;
    if (!orderId && docSnap.exists()) {
      orderId = docSnap.data().orderId;
    }

    await setDoc(docRef, {
      status: 'COMPLETED',
      result,
      orderId: orderId || null,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Extrai as faixas de qualquer estrutura da Kie.ai
    const tracks = extractAudioTracks(result);

    if (orderId && tracks.length > 0) {
      const primaryAudio = tracks[0].audio_url;
      const audioFiles = tracks.map(t => t.audio_url).filter(Boolean);
      // trackId de cada faixa — é o audioId que a Kie.ai usa pra identificar a variante na hora de
      // separar vocal/instrumental (add-on de playback, ver src/lib/playback.js).
      const audioIds = tracks.map(t => t.trackId).filter(Boolean);

      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.exists() ? orderSnap.data() : {};

      await updateDoc(orderRef, {
        audioUrl: primaryAudio,
        audioFiles: audioFiles,
        audioIds: audioIds,
        productionStatus: 'AUDIO_GERADO',
        updatedAt: new Date().toISOString()
      });
      console.log(`Ordem ${orderId} no Firebase atualizada com sucesso com ${audioFiles.length} áudios!`);

      await notifyMusicReady(orderRef, orderData, orderId);
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};

/**
 * Envia o WhatsApp de "música pronta", com reserva de idempotência — chamado automaticamente por
 * updateTaskResult, e reutilizado pelo reenvio manual do painel admin (api/admin/notify-music-ready).
 * @param {object} orderRef referência Firestore do pedido
 * @param {object} orderData dados já lidos do pedido (evita um getDoc a mais quando o chamador já tem)
 * @param {string} orderId só para os logs (nunca telefone/e-mail — ver M-25 no AUDIT_REPORT.md)
 * @param {{force?: boolean}} opts force=true ignora whatsappSent/whatsappSending — uso do reenvio
 *   manual, para destravar pedidos com whatsappSending preso (ver incidente 14-19/08/2026: export
 *   sem import local quebrava o envio antes de marcar whatsappSending:false).
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export const notifyMusicReady = async (orderRef, orderData, orderId, opts = {}) => {
  const force = Boolean(opts.force);

  if (!orderData.customerPhone) return { sent: false, reason: 'no_phone' };
  if (!force && orderData.whatsappSent) return { sent: false, reason: 'already_sent' };
  // REGRA ANTI-BAN: só manda mensagem de "música pronta" pra quem já iniciou conversa pelo WhatsApp
  // (whatsappRequested === true, gravado em src/app/api/whatsapp/webhook/route.js quando o cliente
  // manda o ID do pedido). Mensagem iniciada pela empresa pra quem nunca escreveu é o padrão que
  // gerou bloqueio de conta antes (ver comentário histórico em src/lib/whatsapp.js) — mesma regra já
  // aplicada na régua de recuperação (src/app/api/cron/recover/route.js).
  if (!force && !orderData.whatsappRequested) return { sent: false, reason: 'not_requested' };

  // runTransaction não existe em firebase/firestore/lite (o SDK usado no Edge Runtime) — checagem
  // sequencial: getDoc para ler o estado atual, updateDoc para reservar o envio. Numa corrida bem
  // apertada entre webhook e polling, as duas chamadas podem passar pela checagem antes de qualquer
  // updateDoc acontecer — pior caso é reenviar a mesma mensagem uma vez a mais, nunca perder o envio.
  let shouldSend = force;
  if (!force) {
    try {
      const freshSnap = await getDoc(orderRef);
      if (freshSnap.exists()) {
        const freshData = freshSnap.data();
        if (!freshData.whatsappSent && !freshData.whatsappSending) {
          await updateDoc(orderRef, { whatsappSending: true });
          shouldSend = true;
        }
      }
    } catch (txErr) {
      console.warn("Erro ao reservar o envio de WhatsApp:", txErr);
    }
  }

  if (!shouldSend) return { sent: false, reason: 'already_sending' };

  const deliveryUrl = resolveDeliveryUrl(orderId);
  // Prioriza o número que de fato escreveu no WhatsApp (whatsappSenderPhone, gravado em
  // src/app/api/whatsapp/webhook/route.js) sobre o customerPhone digitado no formulário do site —
  // podem ser números diferentes (ex: pessoa comprou com um número e escreveu no WhatsApp com outro).
  // Mandar pro customerPhone nesse caso é mensagem pra pessoa errada (ver incidente 25/08/2026).
  const targetPhone = orderData.whatsappSenderPhone || orderData.customerPhone;
  const sendResult = await sendMusicReadyTemplate(targetPhone, {
    customerName: orderData.customerName,
    honoreeName: orderData.honoreeName,
    deliveryUrl,
  });

  if (sendResult.success) {
    await updateDoc(orderRef, {
      whatsappSent: true,
      whatsappSentAt: new Date().toISOString(),
      whatsappSending: false
    }).catch(e => console.warn("Erro ao atualizar whatsappSent:", e));
    console.log(`Mensagem do WhatsApp (música pronta) enviada com sucesso — pedido ${orderId}`);
    return { sent: true };
  }

  await updateDoc(orderRef, { whatsappSending: false }).catch(e => console.warn(e));
  console.warn(`Falha ao enviar WhatsApp (música pronta) — pedido ${orderId}`);
  return { sent: false, reason: sendResult.error || 'send_failed' };
};

