import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regressão do achado #4 da auditoria de fechamento (2026-08-02): paymentIntentId é sobrescrito a
// cada nova cobrança do mesmo pedido (ex: cliente troca de pacote antes de pagar, ou compra o
// add-on de vídeo depois de já ter pago a música) — sem preservar o txid anterior em algum lugar, o
// webhook dessa cobrança antiga não encontra mais o pedido se ela for paga. Este teste garante que o
// txid substituído é preservado em `previousPaymentIntentIds`.

let store;
let updateDocCalls;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

const ARRAY_UNION = Symbol('arrayUnion');
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _collection, id) => ({ id }),
  getDoc: async (ref) => ({
    exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
    data: () => store[ref.id],
  }),
  updateDoc: async (ref, updates) => {
    updateDocCalls.push({ id: ref.id, updates });
    Object.assign(store[ref.id], updates);
  },
  arrayUnion: (...values) => ({ __arrayUnion: values, [ARRAY_UNION]: true }),
}));

const createPixChargeMock = vi.fn();
vi.mock('@/lib/efi', () => ({
  createPixCharge: (...args) => createPixChargeMock(...args),
}));

const { POST } = await import('@/app/api/payments/create/route');

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  store = {};
  updateDocCalls = [];
  createPixChargeMock.mockReset();
});

describe('POST /api/payments/create — histórico de paymentIntentId', () => {
  it('não grava previousPaymentIntentIds na primeira cobrança do pedido', async () => {
    store['order1'] = {};
    createPixChargeMock.mockResolvedValue({ txid: 'txid-1', pixCopiaECola: 'copia-cola-1' });

    await POST(makeRequest({ orderId: 'order1', sku: 'audio_only' }));

    const call = updateDocCalls.find((c) => c.id === 'order1');
    expect(call.updates.paymentIntentId).toBe('txid-1');
    expect(call.updates.previousPaymentIntentIds).toBeUndefined();
  });

  it('preserva o txid anterior em previousPaymentIntentIds ao trocar de pacote antes de pagar', async () => {
    store['order2'] = { paymentIntentId: 'txid-antigo-audio-only' };
    createPixChargeMock.mockResolvedValue({ txid: 'txid-novo-combo', pixCopiaECola: 'copia-cola-2' });

    await POST(makeRequest({ orderId: 'order2', sku: 'combo' }));

    const call = updateDocCalls.find((c) => c.id === 'order2');
    expect(call.updates.paymentIntentId).toBe('txid-novo-combo');
    expect(call.updates.previousPaymentIntentIds.__arrayUnion).toEqual(['txid-antigo-audio-only']);
  });

  it('não duplica o histórico quando o txid gerado é o mesmo já persistido', async () => {
    store['order3'] = { paymentIntentId: 'txid-mesmo' };
    createPixChargeMock.mockResolvedValue({ txid: 'txid-mesmo', pixCopiaECola: 'copia-cola-3' });

    await POST(makeRequest({ orderId: 'order3', sku: 'audio_only' }));

    const call = updateDocCalls.find((c) => c.id === 'order3');
    expect(call.updates.previousPaymentIntentIds).toBeUndefined();
  });
});
