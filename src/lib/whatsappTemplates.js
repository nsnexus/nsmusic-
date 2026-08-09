// resolveDeliveryUrl não depende de nada específico de servidor (ao contrário de src/lib/whatsapp.js,
// que precisa de @cloudflare/next-on-pages) — arquivo separado só por isso, ver M-19 no AUDIT_REPORT.md.

export function resolveDeliveryUrl(orderId) {
  const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost'))
    ? 'https://nsmusic.nsnexus.com.br'
    : rawUrl;
  return `${baseUrl}/entrega?orderId=${orderId}`;
}
