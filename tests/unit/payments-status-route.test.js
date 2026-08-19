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

  it('consulta a Efí de verdade e aprova quando o paymentId é o paymentIntentId atual do pedido', async () => {
    store['order4'] = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      paymentId: 'txid-musica-ja-paga',
      // /api/payments/create grava paymentIntentId com o txid da cobrança recém-criada antes de
      // responder ao cliente — então, numa cobrança legítima, este campo já bate com o txid
      // consultado no momento em que o polling começa.
      paymentIntentId: 'txid-video-recem-pago',
    };
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '6.90' } });

    const res = await GET(makeRequest('order4', 'txid-video-recem-pago'));
    const data = await res.json();

    expect(getChargeStatusMock).toHaveBeenCalledWith('txid-video-recem-pago', expect.anything());
    expect(applyPaymentApprovalMock).toHaveBeenCalledWith('order4', 'txid-video-recem-pago', expect.objectContaining({ status: 'approved' }), expect.anything());
    expect(data.status).toBe('approved');
  });

  // Regressão de um bug de segurança encontrado na auditoria de fechamento de 2026-08-02: o txid
  // consultado nunca era comparado ao paymentIntentId do pedido antes de aprovar — um txid CONCLUIDA
  // de QUALQUER cobrança (ex: uma que o próprio atacante pagou para um pedido seu) aprovava qualquer
  // orderId informado, permitindo reaproveitar um único Pix pago contra pedidos alheios.
  it('NÃO aprova quando o txid está CONCLUIDA na Efí mas não pertence a este pedido', async () => {
    store['order5'] = {
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      paymentIntentId: 'txid-deste-pedido',
    };
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const res = await GET(makeRequest('order5', 'txid-de-outro-pedido-ja-pago'));
    const data = await res.json();

    expect(data.status).toBe('pending');
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  // Achado #4 da auditoria de fechamento (2026-08-02): o cliente gerou uma nova cobrança (trocou de
  // pacote, ou comprou o add-on de vídeo depois) e paga a cobrança ANTIGA por engano — o txid não é
  // mais o paymentIntentId atual, mas continua pertencendo a este pedido via o histórico.
  it('aprova quando o txid é uma cobrança anterior deste pedido (previousPaymentIntentIds)', async () => {
    store['order6'] = {
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      paymentIntentId: 'txid-atual-combo',
      previousPaymentIntentIds: ['txid-antigo-audio-only'],
    };
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '9.99' } });

    const res = await GET(makeRequest('order6', 'txid-antigo-audio-only'));
    const data = await res.json();

    expect(applyPaymentApprovalMock).toHaveBeenCalledWith(
      'order6',
      'txid-antigo-audio-only',
      expect.objectContaining({ status: 'approved' }),
      expect.anything()
    );
    expect(data.status).toBe('approved');
  });
});
