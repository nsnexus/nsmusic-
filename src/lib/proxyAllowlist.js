// Allowlist de domínios que os proxies de mídia (/api/image-proxy, /api/audio/proxy) podem buscar.
// Sem isso, os proxies são um SSRF genérico: qualquer URL absoluta é aceita e repassada ao cliente
// (ver A-05/A-06 em docs/audit/AUDIT_REPORT.md).

const ALLOWED_HOSTS = [
  'musicfile.kie.ai',
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
