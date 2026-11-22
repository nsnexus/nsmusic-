/**
 * PIX dinâmico da Efí expira em 3600 segundos. Trabalhamos com margem de
 * segurança de cinco minutos para não entregar um QR que vence durante o
 * pagamento. Esta regra vale tanto para /entrega quanto para /api/payments/create.
 */
export const PIX_CLIENT_MAX_AGE_MS = 55 * 60 * 1000;
export const PIX_EXPIRATION_SAFETY_MS = 5 * 60 * 1000;

export function pixLocalAindaValido(pix, now = Date.now()) {
  if (!pix || typeof pix.qrCode !== 'string' || !pix.qrCode.trim()) return false;
  const generatedAt = Date.parse(String(pix.generatedAt || ''));
  return Number.isFinite(generatedAt) && Number.isFinite(now) &&
    now >= generatedAt && now - generatedAt < PIX_CLIENT_MAX_AGE_MS;
}

/**
 * Nunca considere só status=ATIVA: a Efí pode informar ATIVA mesmo que o
 * período calendario.criacao+expiracao tenha transcorrido. Rechecar a cobrança
 * e a existência do payload real antes de reutilizar um intent persistido.
 * Em caso de metadados ausentes, preferir um novo checkout confiável.
 */
export function cobrancaEfiAindaPagavel(charge, now = Date.now()) {
  if (!charge || charge.status !== 'ATIVA') return false;
  if (typeof charge.pixCopiaECola !== 'string' || !charge.pixCopiaECola.trim()) return false;
  const criacao = Date.parse(String(charge.calendario?.criacao || ''));
  const expiracao = Number(charge.calendario?.expiracao);
  if (!Number.isFinite(criacao) || !Number.isFinite(expiracao) || expiracao <= 0) return false;
  const restante = criacao + expiracao * 1000 - now;
  return Number.isFinite(restante) && restante > PIX_EXPIRATION_SAFETY_MS;
}
