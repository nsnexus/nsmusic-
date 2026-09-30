import { getOrder, updateOrder } from './supabaseDb.js';

/**
 * Dispara a renderização do Vídeo Karaokê na VPS.
 * Se a VPS_VIDEO_URL estiver configurada, envia os dados para /render-karaoke.
 */
export async function triggerKaraokeRender(orderId, optionsOrEnv = {}, maybeEnv = {}) {
  const isEnv = Boolean(optionsOrEnv?.VPS_VIDEO_URL || optionsOrEnv?.SUPABASE_URL || optionsOrEnv?.nsmusic_media);
  const env = isEnv ? optionsOrEnv : (maybeEnv || {});
  const options = isEnv ? {} : (optionsOrEnv || {});

  const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || '').trim();
  const vpsSecret = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();

  const order = await getOrder(orderId, env);
  if (!order) {
    return { ok: false, error: 'Pedido não encontrado' };
  }

  const audioFiles = Array.isArray(order.audioFiles)
    ? order.audioFiles.map(f => typeof f === 'string' ? f : f?.url).filter(Boolean)
    : [];

  let audioUrl = options.audioUrl || null;
  if (!audioUrl && typeof options.trackIndex === 'number' && audioFiles[options.trackIndex]) {
    audioUrl = audioFiles[options.trackIndex];
  }
  if (!audioUrl && options.audioId && Array.isArray(order.audioIds) && audioFiles.length > 0) {
    const idx = order.audioIds.indexOf(options.audioId);
    if (idx !== -1 && audioFiles[idx]) {
      audioUrl = audioFiles[idx];
    }
  }
  if (!audioUrl) {
    audioUrl = order.karaokeChosenAudioUrl || order.audioUrl || audioFiles[0] || '';
  }

  if (!audioUrl) {
    return { ok: false, error: 'Áudio original da música não encontrado' };
  }

  const chosenTrackIndex = typeof options.trackIndex === 'number'
    ? options.trackIndex
    : (audioFiles.indexOf(audioUrl) !== -1 ? audioFiles.indexOf(audioUrl) : null);

  const playbackUrl = order.playbackUrl || null;
  const coverUrl = order.coverUrl || (Array.isArray(order.slideshowImages) && order.slideshowImages[0]) || null;
  const lyrics = order.lyrics || '';
  const title = `Karaokê - ${order.honoreeName || order.customerName || 'Música'}`;

  const nowIso = new Date().toISOString();
  await updateOrder(orderId, {
    karaokeStatus: 'GERANDO',
    karaokeError: null,
    karaokeChosenAudioUrl: audioUrl,
    karaokeChosenTrackIndex: chosenTrackIndex,
    karaokeRequestedAt: nowIso,
    updatedAt: nowIso,
  }, env);

  if (!vpsVideoUrl) {
    console.log(`[karaoke] VPS_VIDEO_URL não configurada. Pedido ${orderId} marcado como GERANDO aguardando processador.`);
    return { ok: true, status: 'QUEUED', message: 'Aguardando processador de vídeo' };
  }

  try {
    const cleanUrl = vpsVideoUrl.replace(/\/+$/, '');
    const endpoint = `${cleanUrl}/render-karaoke`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vpsSecret}`,
      },
      body: JSON.stringify({
        orderId,
        audioUrl,
        playbackUrl,
        coverUrl,
        lyrics,
        title,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json().catch(() => ({}));
    return { ok: true, status: 'PROCESSING', data };
  } catch (err) {
    console.warn(`[karaoke] Falha ao acionar VPS para pedido ${orderId}:`, err.message);
    await updateOrder(orderId, {
      karaokeStatus: 'ERRO',
      karaokeError: err.message,
      updatedAt: new Date().toISOString(),
    }, env).catch(() => {});
    return { ok: false, error: err.message };
  }
}
