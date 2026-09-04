import { AUDIO_CACHE_VERSION } from './audioCacheVersion';

// Toda URL de áudio da Kie.ai/Suno precisa passar pelo /api/audio/proxy antes de virar `src` de
// <audio> no navegador — tocar direto de musicfile.kie.ai falha silenciosamente (CORS/headers da
// CDN deles), achado 04/09/2026 ao adicionar preview de faixa no Playback e na Carta ("nenhuma das
// 2 faixas não tem nada" — eram as únicas duas telas tocando a URL crua, sem passar pelo proxy;
// /retrospectiva já fazia isso certo, replicado aqui em vez de duplicado por arquivo — ver
// .claude/rules/frontend.md, função repetida em dois arquivos vai pra src/lib/).
export function buildAudioProxySrc(rawUrl) {
  if (!rawUrl) return '';
  if (rawUrl.startsWith('/api/')) return rawUrl;
  return `/api/audio/proxy?url=${encodeURIComponent(rawUrl)}&v=${AUDIO_CACHE_VERSION}`;
}
