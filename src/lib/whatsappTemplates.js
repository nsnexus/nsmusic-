// resolveDeliveryUrl não depende de nada específico de servidor (ao contrário de src/lib/whatsapp.js,
// que precisa de @cloudflare/next-on-pages) — arquivo separado só por isso, ver M-19 no AUDIT_REPORT.md.

export function resolveDeliveryUrl(orderId) {
  const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost'))
    ? 'https://nsmusic.nsnexus.com.br'
    : rawUrl;
  return `${baseUrl}/entrega?orderId=${orderId}`;
}

/**
 * Formata um telefone brasileiro para o formato internacional 55+DDD+Número.
 */
export const formatToWhatsAppNumber = (phone) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (!clean) return '';

  // Se já começar com 55 e tiver 12 ou 13 dígitos
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    return clean;
  }

  // Se for DDD + 8 ou 9 dígitos (ex: 94991064040 ou 9491064040)
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }

  return clean;
};
