// Disparo da separação vocal (add-on Playback) no serviço de áudio da VPS (Demucs).
//
// Usado pela rota /api/playback/generate (cliente clica em "Gerar Playback") e por
// applyPaymentApproval (pagou → já dispara). A VPS processa em segundo plano e grava
// playbackStatus = READY/FAILED direto no Supabase.
//
// Problema que isto resolve (23/11/2026): se a VPS perdia o trabalho (reinício, falta de memória,
// erro antes de gravar FAILED), o pedido ficava em GERANDO para sempre e o cliente preso na tela
// "Separando Voz e Instrumentos..." sem nenhum botão. Agora todo disparo grava playbackStartedAt;
// passado PLAYBACK_LIMITE_MS sem resposta, o pedido é considerado travado e pode ser disparado de novo.

export const PLAYBACK_LIMITE_MS = 6 * 60 * 1000;

export function playbackTravado(order, agora = Date.now()) {
  if (!order || order.playbackStatus !== 'GERANDO') return false;
  const inicio = Date.parse(order.playbackStartedAt || order.extras?.playbackStartedAt || '');
  // Pedido antigo, de antes deste campo existir: sem data de início não há como saber se
  // ainda está rodando, então é tratado como travado (a VPS leva ~1 min).
  if (!Number.isFinite(inicio)) return true;
  return agora - inicio > PLAYBACK_LIMITE_MS;
}

export function resolverEndpointSeparacao(env = {}) {
  const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || '').trim();
  let vpsAudioUrl = String(env?.VPS_AUDIO_URL || process.env.VPS_AUDIO_URL || '').trim();
  if (!vpsAudioUrl) {
    vpsAudioUrl = vpsVideoUrl
      ? vpsVideoUrl.replace(/\/video\/?$/, '/audio')
      : 'https://evolution.nsnexus.com.br/audio';
  }
  let limpa = vpsAudioUrl.replace(/\/+$/, '');
  if (limpa.includes('81.17.98.66')) {
    limpa = limpa.replace(/https?:\/\/81\.17\.98\.66(\/audio)?/, 'https://evolution.nsnexus.com.br/audio');
  }
  const endpoint = limpa.endsWith('/separate') ? limpa : `${limpa}/separate`;
  const segredo = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();
  return { endpoint, segredo };
}

// Envia o trabalho para a VPS e ESPERA a resposta de aceite (sem isso, no Edge da Cloudflare um
// fetch solto pode ser cortado quando a requisição termina). Nunca lança.
export async function dispararSeparacaoVps({ orderId, audioUrl, env = {}, fetchImpl = fetch }) {
  const { endpoint, segredo } = resolverEndpointSeparacao(env);
  if (!segredo) return { ok: false, motivo: 'sem_segredo' };
  if (!orderId || !audioUrl) return { ok: false, motivo: 'sem_audio' };
  try {
    const res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${segredo}` },
      body: JSON.stringify({ orderId, audioUrl }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, motivo: `http_${res.status}` };
    const dados = await res.json().catch(() => ({}));
    return { ok: true, dados };
  } catch (err) {
    return { ok: false, motivo: err?.name === 'TimeoutError' ? 'timeout' : 'rede' };
  }
}
