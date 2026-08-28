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
 * Limpa um identificador de telefone/LID vindo do WhatsApp preservando o sufixo "@lid" quando
 * presente (ver route.js:extractSenderPhone, achado 28/08/2026) — usado tanto pra montar a chave de
 * sessão do agente (src/lib/whatsappAgent.js) quanto antes de mandar pra formatToWhatsAppNumber.
 * Sem isso, `String(id).replace(/\D/g,'')` (limpeza ingênua) descarta as letras de "@lid" junto do
 * resto da pontuação e devolve um dígito solto que a W-API aceita mas nunca entrega.
 */
export function cleanWhatsAppId(raw) {
  if (!raw) return '';
  const str = String(raw);
  const isLid = str.includes('@lid');
  const digits = str.replace(/\D/g, '');
  if (!digits) return '';
  return isLid ? `${digits}@lid` : digits;
}

/**
 * Formata um telefone brasileiro para o formato internacional 55+DDD+Número.
 */
export const formatToWhatsAppNumber = (phone) => {
  if (!phone) return '';

  // LID (identificador de privacidade do WhatsApp — ver route.js:extractSenderPhone, achado
  // 28/08/2026): não é telefone, então nenhuma das regras de DDI/9º dígito abaixo se aplica. A W-API
  // só entrega a mensagem pro LID se o sufixo "@lid" for mantido — dígito solto é aceito pela API
  // (200) mas não entrega em lugar nenhum.
  if (String(phone).includes('@lid')) {
    const digits = String(phone).replace(/\D/g, '');
    return digits ? `${digits}@lid` : '';
  }

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
