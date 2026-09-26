import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { sendMusicReadyTemplate } from './whatsapp.js';
import { resolveDeliveryUrl } from './whatsappTemplates.js';

export const getTask = async (taskId, env = {}) => {
  if (!taskId) return null;

  // 1. Tenta buscar no Supabase como primário
  try {
    const { getSupabaseEdge } = await import('./supabase-edge.js');
    const { mapSupabaseTaskToFirestore } = await import('./supabaseSync.js');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data, error } = await supabase
        .from('suno_tasks')
        .select('*')
        .eq('id', taskId)
        .maybeSingle();

      if (!error && data) {
        return mapSupabaseTaskToFirestore(data);
      }
    }
  } catch (err) {
    console.warn("[db] Falha ao consultar task no Supabase:", err.message);
  }

  // 2. Fallback no Firestore
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
/**
 * @param {object} [extra] campos além do básico. Hoje só `provider` ('kie'), gravado desde que o
 *   projeto experimentou um segundo provedor de geração em 24/09/2026.
 */
export const saveTask = async (taskId, status, result = null, orderId = null, extra = {}, env = {}) => {
  const nowIso = new Date().toISOString();
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    // merge:true padronizado com updateTaskResult (ver M-06 no AUDIT_REPORT.md) — sem isso, uma
    // chamada aqui depois de updateTaskResult já ter gravado o resultado apagaria os campos extras.
    await setDoc(docRef, {
      status,
      result,
      orderId,
      ...(extra.provider ? { provider: extra.provider } : {}),
      updatedAt: nowIso
    }, { merge: true });

    // Persistência imediata no Supabase
    try {
      const { mirrorTaskToSupabase } = await import('./supabaseSync.js');
      await mirrorTaskToSupabase(taskId, {
        status,
        result,
        orderId,
        provider: extra.provider || null,
        updatedAt: nowIso
      }, env);
    } catch {}

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
      // NÃO acrescenta .mp3 em URL da musicfile.kie.ai — ver comentário abaixo (achado 28/08/2026).
      return { audio_url: t, audioUrl: t };
    }

    // Ordem de preferência entre os campos que a Kie.ai manda para a mesma faixa.
    // Achado 29/08/2026: o stream é servido por musicfile.kie.ai, que parou de entregar arquivos.
    // Achado 25/09/2026: audiostream.kie.ai é apenas um stream de preview que expira em poucos minutos (0 byte).
    // O arquivo MP3 estático e completo da CDN da Kie.ai fica em `https://tempfile.aiquickdraw.com/r/<uuid>.mp3`.
    const rawCandidates = [
      t.audio_url, t.audioUrl,
      t.source_audio_url, t.sourceAudioUrl,
      t.stream_audio_url, t.streamAudioUrl,
      t.sourceStreamAudioUrl, t.source_stream_audio_url
    ].filter((u) => typeof u === 'string' && u.trim());

    // Extrai o UUID da faixa de qualquer campo presente
    const uuidMatch = rawCandidates.join(' ').match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
    const trackId = (t.id && /^[a-f0-9-]{36}$/i.test(t.id)) ? t.id : (uuidMatch ? uuidMatch[1] : (t.id || ''));

    // Deriva a URL estável do tempfile quando há UUID e candidatos de áudio
    const hasAudiostream = rawCandidates.some(u => u.includes('audiostream.kie.ai'));
    const tempUrl = (trackId && (hasAudiostream || rawCandidates.length > 0) && /^[a-f0-9-]{36}$/i.test(trackId))
      ? `https://tempfile.aiquickdraw.com/r/${trackId}.mp3`
      : '';

    const urlCandidates = [
      t.audio_url, t.audioUrl,
      tempUrl,
      t.source_audio_url, t.sourceAudioUrl,
      t.stream_audio_url, t.streamAudioUrl,
    ].filter((u) => typeof u === 'string' && u.trim());

    let url = urlCandidates.find((u) => !u.includes('musicfile.kie.ai') && !u.includes('audiostream.kie.ai'))
      || urlCandidates.find((u) => !u.includes('musicfile.kie.ai'))
      || urlCandidates[0] || '';

    // Se não tem URL válida mas tem trackId, gera a URL da CDN do Suno como fallback
    if (!url && trackId) {
      url = `https://cdn1.suno.ai/${trackId}.mp3`;
    }

    // Capa gerada pela Kie.ai junto do áudio (campo `image_url` no callback, doc oficial da Kie.ai) —
    // usada como capa padrão quando o cliente não subiu foto própria, ver updateTaskResult abaixo.
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
    const nowIso = new Date().toISOString();
    const docRef = doc(db, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    let orderId = overrideOrderId;
    if (!orderId && docSnap.exists()) {
      orderId = docSnap.data().orderId;
    }
    if (!orderId) {
      try {
        const task = await getTask(taskId, env);
        if (task?.orderId) {
          orderId = task.orderId;
        }
      } catch {}
    }

    await setDoc(docRef, {
      status: 'COMPLETED',
      result,
      orderId: orderId || null,
      updatedAt: nowIso
    }, { merge: true });

    // Persistência imediata no Supabase
    try {
      const { mirrorTaskToSupabase } = await import('./supabaseSync.js');
      await mirrorTaskToSupabase(taskId, {
        status: 'COMPLETED',
        result,
        orderId: orderId || null,
        updatedAt: nowIso
      }, env);
    } catch {}

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

      // Verifica se o resultado recebido é referente à MESMA música que já foi salva e arquivada
      // no nosso Storage (R2/Firebase). Só preservamos a URL do nosso Storage se for a MESMA música
      // já concluída (evitando que webhook atrasado reverta para link efêmero da Kie).
      // Se for uma NOVA geração (admin pediu regerar, status GERANDO_AUDIO, nova tarefa ou novo trackId),
      // a nova música gerada DEVE substituir a anterior e ser arquivada no nosso storage!
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

      // Capa gerada pela Kie.ai substitui a capa padrão (Unsplash) só quando o cliente NÃO subiu foto
      // própria — coverUrl vazio é o sinal disso em todo o resto do app (ver criar/page.jsx,
      // entrega/page.jsx). Nunca sobrescreve uma foto que o cliente já escolheu.
      if (!orderData.coverUrl && tracks[0]?.imageUrl) {
        updates.coverUrl = tracks[0].imageUrl;
      }

      await updateDoc(orderRef, updates);
      console.log(`Ordem ${orderId} no Firebase atualizada com sucesso com ${audioFiles.length} áudios!`);

      // Copia o áudio para o NOSSO storage imediatamente, antes de qualquer pagamento (se ainda não for nosso ou se for nova geração).
      let archiveResult = null;
      if (!isMesmaMusicaJaArquivada) {
        try {
          const { arquivarAudioDoPedido } = await import('./audioArchive.js');
          archiveResult = await arquivarAudioDoPedido({ orderRef, orderId, env, getDoc, updateDoc });
        } catch (err) {
          console.warn('[db] Falha ao arquivar áudio na chegada:', err.message);
        }
      }

      // Se o R2 arquivou com sucesso na hora, atualiza as URLs espelhadas para o Supabase
      const finalUpdates = { ...updates };
      if (archiveResult?.files?.length) {
        finalUpdates.audioFiles = archiveResult.files;
        finalUpdates.audioUrl = archiveResult.files[0];
        if (archiveResult.arquivou) {
          finalUpdates.audioArchivedAt = new Date().toISOString();
        }
      }

      // Persistência imediata no Supabase
      try {
        const { mirrorOrderToSupabase } = await import('./supabaseSync.js');
        await mirrorOrderToSupabase(orderId, { ...orderData, ...finalUpdates }, env);
      } catch {}

      // Contador da vitrine da home (stats/_live). Só soma se o pedido AINDA NÃO tinha áudio: esta
      // função também roda em reprocessamento e nas duas vias concorrentes (webhook e polling), e
      // sem essa checagem o mesmo pedido inflaria o número várias vezes.
      const jaTinhaAudio = Boolean(orderData.audioUrl || orderData.audioFiles?.length);
      if (!jaTinhaAudio) {
        const { addGeneration } = await import('./liveStats.js');
        await addGeneration();
      }

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

