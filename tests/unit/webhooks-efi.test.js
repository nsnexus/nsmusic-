import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Webhook da Efí: primeira barreira é o segredo na URL (?secret=), a segunda e mais importante é
// nunca confiar no valor do corpo — sempre reconsultar a cobrança na API antes de aprovar.

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

const applyPaymentApprovalMock = vi.fn().mockResolvedValue({ applied: true });
vi.mock('@/lib/payments', () => ({
  applyPaymentApproval: (...args) => applyPaymentApprovalMock(...args),
}));

const getChargeStatusMock = vi.fn();
vi.mock('@/lib/efi', () => ({
  getChargeStatus: (...args) => getChargeStatusMock(...args),
}));

let ordersFound;
vi.mock('firebase/firestore/lite', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  limit: () => ({}),
  getDocs: async () => ({
    empty: ordersFound.length === 0,
    docs: ordersFound.map((id) => ({ id })),
  }),
}));

const { POST } = await import('@/app/api/webhooks/efi/route');

function makeReq(url, body) {
  return {
    url,
    json: async () => body,
  };
}

beforeEach(() => {
  ordersFound = ['order-1'];
  applyPaymentApprovalMock.mockClear();
  getChargeStatusMock.mockReset();
  delete process.env.EFI_WEBHOOK_SECRET;
});

afterEach(() => {
  delete process.env.EFI_WEBHOOK_SECRET;
});

describe('POST /api/webhooks/efi', () => {
  it('ignora silenciosamente (200) quando o segredo da URL não confere', async () => {
    process.env.EFI_WEBHOOK_SECRET = 'segredo-correto';
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const req = makeReq('https://x/api/webhooks/efi?secret=errado', { pix: [{ txid: 'TXID1' }] });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('processa normalmente quando EFI_WEBHOOK_SECRET não está configurado (ainda em setup)', async () => {
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const req = makeReq('https://x/api/webhooks/efi', { pix: [{ txid: 'TXID1' }] });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPaymentApprovalMock).toHaveBeenCalledTimes(1);
  });

  it('aprova o pedido quando a cobrança confirmada na Efí está CONCLUIDA e o pedido é encontrado', async () => {
    process.env.EFI_WEBHOOK_SECRET = 'segredo-correto';
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const req = makeReq('https://x/api/webhooks/efi?secret=segredo-correto', { pix: [{ txid: 'TXID1' }] });
    await POST(req);

    expect(applyPaymentApprovalMock).toHaveBeenCalledWith(
      'order-1',
      'TXID1',
      { status: 'approved', transaction_amount: 9.99 }
    );
  });

  it('nunca confia no corpo do webhook: não aprova se a Efí não confirmar CONCLUIDA', async () => {
    process.env.EFI_WEBHOOK_SECRET = 'segredo-correto';
    getChargeStatusMock.mockResolvedValue({ status: 'ATIVA', valor: { original: '9.99' } });

    const req = makeReq('https://x/api/webhooks/efi?secret=segredo-correto', { pix: [{ txid: 'TXID1' }] });
    await POST(req);

    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('não aprova quando nenhum pedido tem esse paymentIntentId', async () => {
    process.env.EFI_WEBHOOK_SECRET = 'segredo-correto';
    ordersFound = [];
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const req = makeReq('https://x/api/webhooks/efi?secret=segredo-correto', { pix: [{ txid: 'TXID-ORFAO' }] });
    await POST(req);

    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('responde 200 mesmo quando getChargeStatus lança erro (nunca propaga erro ao provedor)', async () => {
    process.env.EFI_WEBHOOK_SECRET = 'segredo-correto';
    getChargeStatusMock.mockRejectedValue(new Error('timeout'));

    const req = makeReq('https://x/api/webhooks/efi?secret=segredo-correto', { pix: [{ txid: 'TXID1' }] });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });
});
