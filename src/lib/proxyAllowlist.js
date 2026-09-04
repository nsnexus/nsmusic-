// Allowlist de domínios que os proxies de mídia (/api/image-proxy, /api/audio/proxy) podem buscar.
// Sem isso, os proxies são um SSRF genérico: qualquer URL absoluta é aceita e repassada ao cliente
// (ver A-05/A-06 em docs/audit/AUDIT_REPORT.md).

const ALLOWED_HOSTS = [
  'musicfile.kie.ai',
  // A Kie.ai também serve o campo `audioUrl`/`sourceAudioUrl` da resposta de geração a partir deste
  // domínio (confirmado em 2026-08-02: sem ele na allowlist, o proxy rejeitava a única URL de áudio
  // realmente presente na resposta, quebrando a prévia/entrega para todo pedido).
  'tempfile.aiquickdraw.com',
  // `instrumental_url` do add-on de Playback (vocal-removal) vem deste domínio irmão, sem o prefixo
  // "temp" (confirmado na doc oficial da Kie.ai, 04/09/2026) — sem ele aqui, o player do playback
  // pronto ficaria mudo do mesmo jeito que os previews de faixa ficavam antes desta correção.
  'file.aiquickdraw.com',
  'cdn1.suno.ai',
  'cdn2.suno.ai',
  'audiopipe.suno.ai',
  'firebasestorage.googleapis.com',
];

export function isAllowedMediaHost(hostname) {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some((allowed) => host === allowed);
}

export function isAllowedMediaUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return isAllowedMediaHost(parsed.hostname);
  } catch (e) {
    return false;
  }
}
