import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orderLookup', () => ({
  findOrderByIdOrNumber: vi.fn(),
}));

vi.mock('@/lib/payments', () => ({
  applyPaymentApproval: vi.fn(),
}));

vi.mock('@/lib/infinitepay', () => ({
  checkInfinitePayPayment: vi.fn(),
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: {} })),
}));

import { POST } from '@/app/api/webhooks/infinitepay/route';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { applyPaymentApproval } from '@/lib/payments';
import { checkInfinitePayPayment } from '@/lib/infinitepay';

function createRequest(body) {
  return new Request('https://nsmusic.ia.br/api/webhooks/infinitepay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/webhooks/infinitepay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 200 e pula se não houver identificadores de pedido ou slug', async () => {
    const req = createRequest({});
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe('missing_identifiers');
    expect(applyPaymentApproval).not.toHaveBeenCalled();
  });

  it('retorna 200 e pula se o pedido não for encontrado no banco', async () => {
    findOrderByIdOrNumber.mockResolvedValue(null);
    const req = createRequest({ order_nsu: 'INEXISTENTE', invoice_slug: 'slug123' });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.skipped).toBe('order_not_found');
    expect(applyPaymentApproval).not.toHaveBeenCalled();
  });

  it('aprova o pedido quando /payment_check confirma pagamento com sucesso', async () => {
    findOrderByIdOrNumber.mockResolvedValue({ id: 'order-123', orderNumber: 'NS-123' });
    checkInfinitePayPayment.mockResolvedValue({
      ok: true,
      paid: true,
      paidAmount: 16.89,
      captureMethod: 'credit_card',
    });
    applyPaymentApproval.mockResolvedValue({ applied: true });

    const req = createRequest({
      order_nsu: 'order-123',
      invoice_slug: 'SLUG_TEST',
      transaction_nsu: 'tx_inf_789',
      paid_amount: 1689,
      capture_method: 'credit_card',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.applied).toBe(true);

    expect(checkInfinitePayPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        orderNsu: 'order-123',
        slug: 'SLUG_TEST',
        transactionNsu: 'tx_inf_789',
      }),
      expect.any(Object)
    );

    expect(applyPaymentApproval).toHaveBeenCalledWith(
      'order-123',
      'tx_inf_789',
      expect.objectContaining({
        status: 'approved',
        transaction_amount: 16.89,
        method: 'credit_card',
        gateway: 'infinitepay',
      }),
      expect.any(Object)
    );
  });
});

