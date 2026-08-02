import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regressão de um bug de segurança real encontrado em produção em 2026-08-02: o atalho de
// "verificação rápida" desta rota aprovava QUALQUER paymentId consultado assim que o pedido já
// tivesse paymentStatus aprovado (de uma compra anterior) — permitindo liberar o add-on de vídeo
// (uma cobrança nova, nunca verificada com a Efí) de graça em qualquer pedido cuja música já
// tivesse sido paga. Ver payments.md: nunca aprovar sem consultar o provedor NESTA requisição.

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _collection, id) => ({ id }),
  getDoc: async (ref) => ({
    exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
    data: () => store[ref.id],
  }),
}));

const getChargeStatusMock = vi.fn();
vi.mock('@/lib/efi', () => ({
  getChargeStatus: (...args) => getChargeStatusMock(...args),
}));

const applyPaymentApprovalMock = vi.fn().mockResolvedValue({ applied: true });
vi.mock('@/lib/payments', () => ({
  applyPaymentApproval: (...args) => applyPaymentApprovalMock(...args),
}));

const { GET } = await import('@/app/api/payments/status/route');

beforeEach(() => {
  store = {};
  getChargeStatusMock.mockReset();
  applyPaymentApprovalMock.mockClear();
});

function makeRequest(orderId, paymentId) {
  return new Request(`https://site.example/api/payments/status?orderId=${orderId}&paymentId=${paymentId}`);
}

describe('GET /api/payments/status — atalho de verificação rápida', () => {
  it('NÃO aprova um paymentId novo (add-on de vídeo) só porque a música já foi aprovada antes', async () => {
    store['order1'] = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      paymentId: 'txid-musica-ja-paga',
      // videoPaymentId ainda não existe — é exatamente esse o cenário do bug: cobrança nova do
      // vídeo, ainda não verificada.
    };
    getChargeStatusMock.mockResolvedValue({ status: 'ATIVA', valor: { original: '6.90' } });

    const res = await GET(makeRequest('order1', 'txid-video-novo-nao-pago'));
    const data = await res.json();

    expect(data.status).toBe('pending');
    expect(getChargeStatusMock).toHaveBeenCalledWith('txid-video-novo-nao-pago', expect.anything());
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('aprova via atalho quando o paymentId bate com o pagamento principal já registrado', async () => {
    store['order2'] = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      paymentId: 'txid-musica-ja-paga',
    };

    const res = await GET(makeRequest('order2', 'txid-musica-ja-paga'));
    const data = await res.json();

    expect(data.status).toBe('approved');
    expect(getChargeStatusMock).not.toHaveBeenCalled();
  });

  it('aprova via atalho quando o paymentId bate com o vídeo já registrado como pago', async () => {
    store['order3'] = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      paymentId: 'txid-musica-ja-paga',
      videoPaymentId: 'txid-video-ja-pago',
      hasVideoAccess: true,
      videoAddonPaid: true,
    };

    const res = await GET(makeRequest('order3', 'txid-video-ja-pago'));
    const data = await res.json();

    expect(data.status).toBe('approved');
    expect(getChargeStatusMock).not.toHaveBeenCalled();
  });

  it('consulta a Efí de verdade quando o paymentId não bate com nenhum já aprovado', async () => {
    store['order4'] = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      paymentId: 'txid-musica-ja-paga',
    };
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '6.90' } });

    const res = await GET(makeRequest('order4', 'txid-video-recem-pago'));
    const data = await res.json();

    expect(getChargeStatusMock).toHaveBeenCalledWith('txid-video-recem-pago', expect.anything());
    expect(applyPaymentApprovalMock).toHaveBeenCalledWith('order4', 'txid-video-recem-pago', expect.objectContaining({ status: 'approved' }));
    expect(data.status).toBe('approved');
  });
});
