import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sendWhatsAppMessage } from './whatsapp';

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

export const saveTask = async (taskId, status, result = null, orderId = null) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    await setDoc(docRef, {
      status,
      result,
      orderId,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error saving task:", err);
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
    if (typeof t === 'string') return { audio_url: t, audioUrl: t };
    const url = t.sourceAudioUrl || t.audioUrl || t.audio_url || t.streamAudioUrl || t.sourceStreamAudioUrl || t.stream_url || t.url || t.audioFile || t.cdn_url || t.audio_file || '';
    return {
      ...t,
      audio_url: url,
      audioUrl: url
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
      
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.exists() ? orderSnap.data() : {};

      await updateDoc(orderRef, {
        audioUrl: primaryAudio,
        audioFiles: audioFiles,
        productionStatus: 'AUDIO_GERADO',
        updatedAt: new Date().toISOString()
      });
      console.log(`Ordem ${orderId} no Firebase atualizada com sucesso com ${audioFiles.length} áudios!`);

      // Envio automático do WhatsApp se ainda não tiver sido notificado
      if (orderData.customerPhone && !orderData.whatsappSent) {
        const name = orderData.customerName || 'Cliente';
        const honoree = orderData.honoreeName || 'alguém especial';
        const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
        const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;
        const deliveryUrl = `${baseUrl}/entrega?orderId=${orderId}`;
        
        const messageText = `Olá, ${name}! 🎵\n\nSua música personalizada para *${honoree}* ficou pronta com sucesso no estúdio NSMusic!\n\nForam produzidas 2 versões completas em altíssima qualidade.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nQualquer dúvida, estamos à disposição! ❤️`;

        const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);
        if (sent) {
          await updateDoc(orderRef, { whatsappSent: true, whatsappSentAt: new Date().toISOString() });
          console.log(`Mensagem do WhatsApp enviada com sucesso para ${orderData.customerPhone}`);
        } else {
          console.warn(`Falha ao enviar WhatsApp para ${orderData.customerPhone}`);
        }
      }
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};

