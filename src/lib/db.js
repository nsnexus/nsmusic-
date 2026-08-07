import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';
import { sendMusicReadyTemplate } from './whatsapp';
import { resolveDeliveryUrl } from './whatsappTemplates';

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
      
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);
      const orderData = orderSnap.exists() ? orderSnap.data() : {};

      const orderUpdatePayload = {
        audioUrl: primaryAudio,
        audioFiles: audioFiles,
        productionStatus: 'AUDIO_GERADO',
        updatedAt: new Date().toISOString()
      };
      // Gravado só na primeira vez — usado pelo lembrete automático de pagamento (6h/12h) pra saber
      // quando a música ficou pronta. updatedAt não serve pra isso porque é reescrito por várias
      // outras operações depois (envio de WhatsApp, aprovação de pagamento, etc.).
      if (!orderData.audioGeneratedAt) {
        orderUpdatePayload.audioGeneratedAt = new Date().toISOString();
      }
      await updateDoc(orderRef, orderUpdatePayload);
      console.log(`Ordem ${orderId} no Firebase atualizada com sucesso com ${audioFiles.length} áudios!`);

      // Envio automático do WhatsApp se ainda não tiver sido notificado. updateTaskResult é chamado
      // por duas vias concorrentes (webhook da Kie.ai e polling de /api/suno/status) — sem uma
      // reserva para o envio, as duas podiam disparar a mesma mensagem em paralelo (mesma classe de
      // corrida já corrigida em src/lib/payments.js:notifyApprovalByWhatsApp).
      //
      // runTransaction não existe em firebase/firestore/lite (o SDK usado no Edge Runtime) — antes
      // disso, TODA chamada aqui rejeitava e caía no catch abaixo, então whatsappSent nunca era
      // marcado como enviado por este caminho: o cliente nunca recebia o aviso de "música pronta"
      // (ficava só o log de erro). Substituído por checagem sequencial: getDoc para ler o estado
      // atual, updateDoc para reservar o envio. Numa corrida bem apertada as duas chamadas podem
      // passar pela checagem antes de qualquer updateDoc acontecer — pior caso é reenviar a mesma
      // mensagem uma vez a mais, nunca perder o envio.
      if (orderData.customerPhone && !orderData.whatsappSent) {
        let shouldSend = false;
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

        if (shouldSend) {
          const deliveryUrl = resolveDeliveryUrl(orderId);
          const sendResult = await sendMusicReadyTemplate(orderData.customerPhone, {
            customerName: orderData.customerName,
            honoreeName: orderData.honoreeName,
            deliveryUrl,
          });
          const sent = sendResult.success;
          if (sent) {
            await updateDoc(orderRef, {
              whatsappSent: true,
              whatsappSentAt: new Date().toISOString(),
              whatsappSending: false
            }).catch(e => console.warn("Erro ao atualizar whatsappSent:", e));
            // Nunca logar telefone/e-mail do cliente (ver M-25 no AUDIT_REPORT.md) — orderId já
            // identifica o pedido o suficiente para depuração.
            console.log(`Mensagem do WhatsApp (música pronta) enviada com sucesso — pedido ${orderId}`);
          } else {
            await updateDoc(orderRef, { whatsappSending: false }).catch(e => console.warn(e));
            console.warn(`Falha ao enviar WhatsApp (música pronta) — pedido ${orderId}`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};

