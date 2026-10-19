// Use only with an authenticated response from getChargeStatus, never a webhook body.
export function confirmedPixAmount(charge) {
  if (charge?.status !== 'CONCLUIDA' || !Array.isArray(charge.pix) || !charge.pix.length) return 0;
  const amounts = charge.pix.map(payment => Number(payment.valor));
  if (amounts.some(value => !Number.isFinite(value) || value <= 0)) return 0;
  return Math.round(amounts.reduce((sum, value) => sum + value, 0) * 100) / 100;
}
