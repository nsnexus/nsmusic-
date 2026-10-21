import { describe, it, expect } from 'vitest';
import {
  calculateStripeFee,
  calculateStripeNet,
  isStripePayment,
  getOrderPaymentMethod,
  getPayoutStatus,
  getOrderFinancialBreakdown,
  STRIPE_CARD_FEE_PERCENT,
  STRIPE_CARD_FEE_FIXED,
  STRIPE_PAYOUT_DAYS
} from '@/lib/paymentFees';

describe('Payment Fees & Payout Utilities', () => {
  describe('calculateStripeFee and calculateStripeNet', () => {
    it('calculates standard fee for R$ 9,99 correctly', () => {
      // 9.99 * 0.0399 + 0.39 = 0.398601 + 0.39 = 0.788601 -> R$ 0,79
      const fee = calculateStripeFee(9.99);
      expect(fee).toBe(0.79);

      const net = calculateStripeNet(9.99);
      expect(net).toBe(9.20);
      expect(fee + net).toBeCloseTo(9.99, 2);
    });

    it('calculates standard fee for R$ 6,90 (video add-on)', () => {
      // 6.90 * 0.0399 + 0.39 = 0.27531 + 0.39 = 0.66531 -> R$ 0,67
      const fee = calculateStripeFee(6.90);
      expect(fee).toBe(0.67);

      const net = calculateStripeNet(6.90);
      expect(net).toBe(6.23);
    });

    it('calculates standard fee for R$ 16,89 (combo)', () => {
      // 16.89 * 0.0399 + 0.39 = 0.673911 + 0.39 = 1.063911 -> R$ 1,06
      const fee = calculateStripeFee(16.89);
      expect(fee).toBe(1.06);

      const net = calculateStripeNet(16.89);
      expect(net).toBe(15.83);
    });

    it('handles 0 or negative values gracefully', () => {
      expect(calculateStripeFee(0)).toBe(0);
      expect(calculateStripeNet(0)).toBe(0);
      expect(calculateStripeFee(-10)).toBe(0);
    });
  });

  describe('isStripePayment and getOrderPaymentMethod', () => {
    it('identifies Stripe payment by session id prefix cs_', () => {
      expect(isStripePayment('cs_live_123456')).toBe(true);
      expect(isStripePayment('cs_test_987654')).toBe(true);
      expect(isStripePayment('24c6e94ef88a44b58e65839257e')).toBe(false);
    });

    it('identifies Stripe payment by order properties', () => {
      expect(isStripePayment({ paymentMethod: 'credit_card' })).toBe(true);
      expect(isStripePayment({ paymentGateway: 'stripe' })).toBe(true);
      expect(isStripePayment({ stripeSessionId: 'cs_123' })).toBe(true);
      expect(isStripePayment({ paymentId: 'cs_live_abc' })).toBe(true);
      expect(isStripePayment({ videoPaymentId: 'cs_live_video' })).toBe(true);
      expect(isStripePayment({ paymentId: 'efi_txid_123' })).toBe(false);
    });

    it('correctly classifies order as credit_card or pix', () => {
      const cardOrder = { paymentStatus: 'PAGO', paymentId: 'cs_live_test' };
      expect(getOrderPaymentMethod(cardOrder)).toBe('credit_card');

      const pixOrder = { paymentStatus: 'PAGAMENTO_APROVADO', paymentId: 'txid_efi_123' };
      expect(getOrderPaymentMethod(pixOrder)).toBe('pix');

      const unpaidOrder = { paymentStatus: 'AGUARDANDO_PAGAMENTO' };
      expect(getOrderPaymentMethod(unpaidOrder)).toBe(null);
    });
  });

  describe('getPayoutStatus (D+30)', () => {
    it('calculates D+30 status for a recent payment as blocked with remaining days', () => {
      const now = new Date();
      const status = getPayoutStatus(now.toISOString(), 30);
      expect(status.isReleased).toBe(false);
      expect(status.daysRemaining).toBeGreaterThanOrEqual(29);
      expect(status.daysRemaining).toBeLessThanOrEqual(30);
    });

    it('marks payment from 35 days ago as released', () => {
      const pastDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const status = getPayoutStatus(pastDate.toISOString(), 30);
      expect(status.isReleased).toBe(true);
      expect(status.daysRemaining).toBe(0);
    });
  });

  describe('getOrderFinancialBreakdown', () => {
    it('returns 0 fee and immediate release for PIX', () => {
      const pixOrder = { paymentStatus: 'PAGO', paymentId: 'txid_123' };
      const breakdown = getOrderFinancialBreakdown(pixOrder, 9.99);
      expect(breakdown.method).toBe('pix');
      expect(breakdown.isCard).toBe(false);
      expect(breakdown.gross).toBe(9.99);
      expect(breakdown.fee).toBe(0);
      expect(breakdown.net).toBe(9.99);
      expect(breakdown.payoutStatus.isReleased).toBe(true);
    });

    it('deducts Stripe fee and calculates D+30 payout for card', () => {
      const cardOrder = { paymentStatus: 'PAGO', paymentId: 'cs_123', paidAt: new Date().toISOString() };
      const breakdown = getOrderFinancialBreakdown(cardOrder, 9.99);
      expect(breakdown.method).toBe('credit_card');
      expect(breakdown.isCard).toBe(true);
      expect(breakdown.gross).toBe(9.99);
      expect(breakdown.fee).toBe(0.79);
      expect(breakdown.net).toBe(9.20);
      expect(breakdown.payoutStatus.isReleased).toBe(false);
    });
  });
});
