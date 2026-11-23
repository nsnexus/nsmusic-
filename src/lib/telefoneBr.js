// Telefone brasileiro do cliente: normalização e máscara usadas no /criar e na edição pelo painel admin.

// Normaliza dígitos de telefone brasileiro removendo pontuação e DDI 55 quando presente.
// No Brasil, todo celular começa com '9' após o DDD. Se o usuário digita 55 seguido de 1..8
// (ex: 55219..., 55119..., 55519...), o '55' inicial é indubitavelmente o DDI do país e não o DDD 55 (Santa Maria/RS).
export function normalizeBrazilPhoneDigits(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('55')) {
    if (digits.length >= 12) {
      digits = digits.slice(2);
    } else if (digits.length >= 3 && digits[2] !== '9') {
      digits = digits.slice(2);
    }
  }
  return digits;
}

// Máscara "(31) 98241-4961" — mesmo formato gravado quando o cliente digita no /criar.
// Número local pode ter 8 dígitos (sem o 9º, esquecimento comum) ou 9 (padrão atual).
export function formatarTelefoneBr(raw) {
  const clean = normalizeBrazilPhoneDigits(raw).slice(0, 11);
  if (!clean) return '';
  let formatted = `(${clean.slice(0, 2)}`;
  if (clean.length > 2) {
    const local = clean.slice(2);
    const splitAt = local.length >= 9 ? 5 : Math.min(4, local.length);
    formatted += `) ${local.slice(0, splitAt)}`;
    if (local.length > splitAt) formatted += `-${local.slice(splitAt)}`;
  }
  return formatted;
}

// Telefone completo para gravar no pedido: DDD + 8 ou 9 dígitos.
export function telefoneBrCompleto(raw) {
  const clean = normalizeBrazilPhoneDigits(raw);
  return clean.length === 10 || clean.length === 11;
}
