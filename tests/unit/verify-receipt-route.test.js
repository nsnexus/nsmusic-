import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock('@/lib/payments', () => ({
  applyPaymentApproval: vi.fn(),
}));

vi.mock('@/lib/efi', () => ({
  getChargeStatus: vi.fn(),
}));

vi.mock('@/lib/receiptVerification', () => ({
  extractReceiptData: vi.fn(),
  isValidE2eIdFormat: vi.fn(() => true),
  findOrderIdByPaymentId: vi.fn(() => null),
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: {} })),
}));

import { POST } from '@/app/api/payments/verify-receipt/route';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';
import { extractReceiptData } from '@/lib/receiptVerification';

function createRequest(body) {
  return new Request('https://nsmusic.com.br/api/payments/verify-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/payments/verify-receipt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('NÃO aprova automaticamente por imagem sintética se a Efí não confirmar a transação', async () => {
    getOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      paymentIntentId: 'txid-123',
    });
    extractReceiptData.mockResolvedValue({
      e2eId: 'E12345678202610240001',
      valor: 9.99,
    });
    // Efí ainda consta como ATIVA (não paga no banco)
    getChargeStatus.mockResolvedValue({ status: 'ATIVA' });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      sku: 'audio_only',
      imageBase64: 'fakebase64',
      mimeType: 'image/jpeg',
    }));

    const data = await res.json();
    expect(data.approved).toBe(false);
    expect(data.status).toBe('manual_review');
    expect(applyPaymentApproval).not.toHaveBeenCalled();
    expect(updateOrder).toHaveBeenCalledWith('ord-1', expect.objectContaining({
      receiptStatus: 'AGUARDANDO_CONFERENCIA'
    }), expect.any(Object));
  });

  it('aprova se a Efí confirmar que a cobrança associada está CONCLUIDA', async () => {
    getOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      paymentIntentId: 'txid-123',
    });
    extractReceiptData.mockResolvedValue({
      e2eId: 'E12345678202610240001',
      valor: 9.99,
    });
    getChargeStatus.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });
    applyPaymentApproval.mockResolvedValue({ applied: true });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      sku: 'audio_only',
      imageBase64: 'fakebase64',
      mimeType: 'image/jpeg',
    }));

    const data = await res.json();
    expect(data.approved).toBe(true);
    expect(applyPaymentApproval).toHaveBeenCalledWith('ord-1', 'E12345678202610240001', expect.objectContaining({
      status: 'approved'
    }), expect.any(Object));
  });
});
