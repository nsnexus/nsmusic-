import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe', () => ({
  getStripeConfig: vi.fn(),
  verifyStripeWebhookSignature: vi.fn(),
  retrieveStripeCheckoutSession: vi.fn(),
}));

vi.mock('@/lib/payments', () => ({
  applyPaymentApproval: vi.fn(),
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: {} })),
}));

import { POST } from '@/app/api/webhooks/stripe/route';
import { getStripeConfig, verifyStripeWebhookSignature, retrieveStripeCheckoutSession } from '@/lib/stripe';
import { applyPaymentApproval } from '@/lib/payments';

function createRequest(body, signature = 'sig_123') {
  return new Request('https://nsmusic.com.br/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/webhooks/stripe (S07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejeita com 503 quando STRIPE_WEBHOOK_SECRET não está configurado (fail-closed)', async () => {
    getStripeConfig.mockReturnValue({ webhookSecret: null, secretKey: 'sk_test' });

    const req = createRequest({ id: 'evt_1', type: 'checkout.session.completed' });
    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(verifyStripeWebhookSignature).not.toHaveBeenCalled();
    expect(applyPaymentApproval).not.toHaveBeenCalled();
  });

  it('rejeita com 400 quando assinatura é inválida', async () => {
    getStripeConfig.mockReturnValue({ webhookSecret: 'whsec_test', secretKey: 'sk_test' });
    verifyStripeWebhookSignature.mockResolvedValue(false);

    const req = createRequest({ id: 'evt_1', type: 'checkout.session.completed' });
    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(applyPaymentApproval).not.toHaveBeenCalled();
  });

  it('NÃO aprova se a reconsulta à API da Stripe falhar ou retornar status não-pago', async () => {
    getStripeConfig.mockReturnValue({ webhookSecret: 'whsec_test', secretKey: 'sk_test' });
    verifyStripeWebhookSignature.mockResolvedValue(true);
    retrieveStripeCheckoutSession.mockResolvedValue({
      id: 'cs_123',
      payment_status: 'unpaid',
      client_reference_id: 'ord-1',
    });

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          client_reference_id: 'ord-1',
          payment_status: 'paid', // atacante forjou no corpo
        }
      }
    };

    const req = createRequest(event);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPaymentApproval).not.toHaveBeenCalled();
  });

  it('aprova quando assinatura é válida e API da Stripe confirma a sessão paga para o pedido', async () => {
    getStripeConfig.mockReturnValue({ webhookSecret: 'whsec_test', secretKey: 'sk_test' });
    verifyStripeWebhookSignature.mockResolvedValue(true);
    retrieveStripeCheckoutSession.mockResolvedValue({
      id: 'cs_123',
      payment_status: 'paid',
      amount_total: 999,
      client_reference_id: 'ord-1',
      metadata: { orderId: 'ord-1', sku: 'audio_only' },
    });
    applyPaymentApproval.mockResolvedValue({ applied: true });

    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          client_reference_id: 'ord-1',
          payment_status: 'paid',
        }
      }
    };

    const req = createRequest(event);
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPaymentApproval).toHaveBeenCalledWith(
      'ord-1',
      'cs_123',
      expect.objectContaining({
        status: 'approved',
        transaction_amount: 9.99,
        method: 'stripe',
      }),
      expect.any(Object)
    );
  });
});
