/**
 * Utilitários financeiros para cálculo de taxas e prazos de repasse de pagamentos (PIX vs Cartão/Stripe).
 *
 * Regras:
 * - PIX (Efí Bank): Repasse instantâneo (D+0), sem taxa retida relevante do cliente.
 * - Cartão de Crédito (Stripe Brasil):
 *   - Taxa padrão: 3,99% + R$ 0,39 por transação.
 *   - Prazo de repasse padrão: 30 dias (D+30).
 */

export const STRIPE_CARD_FEE_PERCENT = 0.0399; // 3.99%
export const STRIPE_CARD_FEE_FIXED = 0.39;    // R$ 0,39
export const STRIPE_PAYOUT_DAYS = 30;         // 30 dias corridos

/**
 * Calcula a taxa da Stripe para um determinado valor bruto em reais.
 * @param {number|string} grossAmount
 * @returns {number} Taxa em reais arredondada para 2 casas decimais.
 */
export function calculateStripeFee(grossAmount) {
  const val = Number(grossAmount) || 0;
  if (val <= 0) return 0;
  return Math.round(((val * STRIPE_CARD_FEE_PERCENT) + STRIPE_CARD_FEE_FIXED) * 100) / 100;
}

/**
 * Calcula o valor líquido recebido após dedução da taxa da Stripe.
 * @param {number|string} grossAmount
 * @returns {number} Valor líquido em reais arredondado para 2 casas.
 */
export function calculateStripeNet(grossAmount) {
  const val = Number(grossAmount) || 0;
  if (val <= 0) return 0;
  const fee = calculateStripeFee(val);
  return Math.max(0, Math.round((val - fee) * 100) / 100);
}

/**
 * Verifica se um ID de transação ou pedido corresponde a um pagamento via Stripe.
 * @param {string|object} idOrOrder
 * @returns {boolean}
 */
export function isStripePayment(idOrOrder) {
  if (!idOrOrder) return false;
  if (typeof idOrOrder === 'string') {
    return idOrOrder.startsWith('cs_') || idOrOrder.startsWith('pi_');
  }

  const o = idOrOrder;
  if (o.paymentMethod === 'credit_card' || o.paymentMethod === 'stripe') return true;
  if (o.paymentGateway === 'stripe') return true;
  if (o.stripeSessionId) return true;

  const paymentIds = [
    o.paymentId,
    o.videoPaymentId,
    o.cartaPaymentId,
    o.playbackPaymentId,
    o.retrospectivaPaymentId,
    o.karaokePaymentId,
    o.customVoicePaymentId,
    o.secondSongPaymentId,
    o.paymentIntentId,
  ];

  return paymentIds.some((id) => typeof id === 'string' && (id.startsWith('cs_') || id.startsWith('pi_')));
}

/**
 * Retorna o método de pagamento de um pedido ('credit_card', 'pix' ou null).
 * @param {object} order
 * @returns {'credit_card' | 'pix' | null}
 */
export function getOrderPaymentMethod(order) {
  if (!order) return null;

  if (isStripePayment(order)) {
    return 'credit_card';
  }

  const isPaid =
    order.paymentStatus === 'PAGAMENTO_APROVADO' ||
    order.paymentStatus === 'PAGO' ||
    Boolean(order.paidAt) ||
    Boolean(order.videoAddonPaid) ||
    Boolean(order.cartaAddonPaid) ||
    Boolean(order.playbackAddonPaid) ||
    Boolean(order.retrospectivaAddonPaid);

  if (isPaid) {
    return 'pix';
  }

  return null;
}

/**
 * Calcula o status de repasse para pagamentos em cartão (D+30).
 * @param {string|Date} paidAt Data em que o pagamento foi confirmado
 * @param {number} payoutDays Dias para repasse (padrão 30)
 * @returns {{ releaseDate: Date | null, isReleased: boolean, daysRemaining: number }}
 */
export function getPayoutStatus(paidAt, payoutDays = STRIPE_PAYOUT_DAYS) {
  if (!paidAt) {
    return { releaseDate: null, isReleased: false, daysRemaining: payoutDays };
  }

  const date = typeof paidAt === 'string' ? new Date(paidAt) : paidAt;
  if (Number.isNaN(date.getTime())) {
    return { releaseDate: null, isReleased: false, daysRemaining: payoutDays };
  }

  const releaseTime = date.getTime() + payoutDays * 24 * 60 * 60 * 1000;
  const releaseDate = new Date(releaseTime);
  const now = Date.now();
  const isReleased = now >= releaseTime;
  const msRemaining = releaseTime - now;
  const daysRemaining = isReleased ? 0 : Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

  return {
    releaseDate,
    isReleased,
    daysRemaining,
  };
}

/**
 * Calcula o detalhamento financeiro completo de um pedido (Bruto, Taxa, Líquido e Status de Repasse).
 * @param {object} order
 * @param {number} grossAmount Valor bruto pago
 * @returns {{
 *   method: 'credit_card' | 'pix' | null,
 *   isCard: boolean,
 *   gross: number,
 *   fee: number,
 *   net: number,
 *   payoutStatus: { releaseDate: Date | null, isReleased: boolean, daysRemaining: number }
 * }}
 */
export function getOrderFinancialBreakdown(order, grossAmount) {
  const method = getOrderPaymentMethod(order);
  const gross = Number(grossAmount) || 0;
  const isCard = method === 'credit_card';

  const fee = isCard ? calculateStripeFee(gross) : 0;
  const net = isCard ? Math.max(0, Math.round((gross - fee) * 100) / 100) : gross;
  const payout = isCard
    ? getPayoutStatus(order?.paidAt || order?.videoPaidAt || order?.createdAt)
    : { releaseDate: null, isReleased: true, daysRemaining: 0 };

  return {
    method,
    isCard,
    gross,
    fee,
    net,
    payoutStatus: payout,
  };
}
