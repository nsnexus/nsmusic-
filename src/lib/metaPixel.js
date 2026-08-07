// Correspondência avançada manual do Pixel do Facebook — chamar antes de um evento importante
// (InitiateCheckout/Purchase) para a Meta casar o visitante com uma conta, mesmo sem cookie de
// terceiro (Safari/iOS). O hash SHA-256 é feito pelo próprio script do Pixel no navegador, nunca
// aqui. Nenhum destes valores é logado (ver .claude/rules/security.md).
const META_PIXEL_ID = '1366434898413500';

// Números salvos no formData/pedido são DDD + 9 dígitos (11 dígitos), sem código do país — a Meta
// espera o telefone em E.164 sem símbolos, então adicionamos o 55 do Brasil.
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `55${digits}`;
}

function normalizeEmail(email) {
  const trimmed = String(email || '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

// E-mail é opcional no formulário (só o telefone é obrigatório e verificado) — por isso nunca
// bloqueamos no e-mail ausente, só enviamos o que existir. Se não houver nem telefone válido nem
// e-mail, não há nada de novo pra mandar e a chamada é ignorada.
export function pushAdvancedMatching(phone, email) {
  if (typeof window === 'undefined' || !window.fbq) return;

  const ph = normalizePhone(phone);
  const em = normalizeEmail(email);
  if (!ph && !em) return;

  const matchData = {};
  if (ph) matchData.ph = ph;
  if (em) matchData.em = em;

  window.fbq('init', META_PIXEL_ID, matchData);
}
