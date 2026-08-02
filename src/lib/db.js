import { doc, getDoc, setDoc, updateDoc, runTransaction } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';
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
    // merge:true padronizado com updateTaskResult (ver M-06 no AUDIT_REPORT.md) — sem isso, uma
    // chamada aqui depois de updateTaskResult já ter gravado o resultado apagaria os campos extras.
    await setDoc(docRef, {
      status,
      result,
      orderId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
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

      // Envio automático do WhatsApp se ainda não tiver sido notificado. updateTaskResult é chamado
      // por duas vias concorrentes (webhook da Kie.ai e polling de /api/suno/status) — sem uma
      // transação para reservar o envio, as duas podiam disparar a mesma mensagem em paralelo
      // (mesma classe de corrida já corrigida em src/lib/payments.js:notifyApprovalByWhatsApp).
      if (orderData.customerPhone && !orderData.whatsappSent) {
        let shouldSend = false;
        try {
          await runTransaction(db, async (tx) => {
            const freshSnap = await tx.get(orderRef);
            if (!freshSnap.exists()) return;
            const freshData = freshSnap.data();
            if (!freshData.whatsappSent && !freshData.whatsappSending) {
              tx.update(orderRef, { whatsappSending: true });
              shouldSend = true;
            }
          });
        } catch (txErr) {
          console.warn("Erro na transação de reserva do envio de WhatsApp:", txErr);
        }

        if (shouldSend) {
          let customerName = orderData.customerName || 'Cliente';
          let honoreeName = orderData.honoreeName || 'alguém especial';

          const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
          const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;
          const deliveryUrl = `${baseUrl}/entrega?orderId=${orderId}`;

          const messageText = `Olá, ${customerName}! 🎵\n\nSua música personalizada para *${honoreeName}* ficou pronta com sucesso no estúdio NSMusic!\n\nForam produzidas 2 versões completas em altíssima qualidade.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nQualquer dúvida, estamos à disposição! ❤️`;

          const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);
          if (sent) {
            await updateDoc(orderRef, {
              whatsappSent: true,
              whatsappSentAt: new Date().toISOString(),
              whatsappSending: false
            }).catch(e => console.warn("Erro ao atualizar whatsappSent:", e));
            console.log(`Mensagem do WhatsApp enviada com sucesso para ${orderData.customerPhone}`);
          } else {
            await updateDoc(orderRef, { whatsappSending: false }).catch(e => console.warn(e));
            console.warn(`Falha ao enviar WhatsApp para ${orderData.customerPhone}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};

