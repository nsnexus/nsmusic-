import { describe, it, expect, vi, beforeEach } from 'vitest';

// Regressão do achado #4 da auditoria de fechamento (2026-08-02): paymentIntentId é sobrescrito a
// cada nova cobrança do mesmo pedido (ex: cliente troca de pacote antes de pagar, ou compra o
// add-on de vídeo depois de já ter pago a música) — sem preservar o txid anterior em algum lugar, o
// webhook dessa cobrança antiga não encontra mais o pedido se ela for paga. Este teste garante que o
// txid substituído é preservado em `previousPaymentIntentIds`.

let store;
let updateOrderCalls;

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: async (id) => store[id] || null,
  updateOrder: async (id, updates) => {
    updateOrderCalls.push({ id, updates });
    if (!store[id]) store[id] = {};
    Object.assign(store[id], updates);
    return store[id];
  },
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
  updateOrderCalls = [];
  createPixChargeMock.mockReset();
});

describe('POST /api/payments/create — histórico de paymentIntentId', () => {
  it('não acumula previousPaymentIntentIds na primeira cobrança do pedido', async () => {
    store['order1'] = {};
    createPixChargeMock.mockResolvedValue({ txid: 'txid-1', pixCopiaECola: 'copia-cola-1' });

    await POST(makeRequest({ orderId: 'order1', sku: 'audio_only' }));

    const call = updateOrderCalls.find((c) => c.id === 'order1');
    expect(call.updates.paymentIntentId).toBe('txid-1');
    expect(call.updates.previousPaymentIntentIds).toEqual([]);
  });

  it('preserva o txid anterior em previousPaymentIntentIds ao trocar de pacote antes de pagar', async () => {
    store['order2'] = { paymentIntentId: 'txid-antigo-audio-only' };
    createPixChargeMock.mockResolvedValue({ txid: 'txid-novo-combo', pixCopiaECola: 'copia-cola-2' });

    await POST(makeRequest({ orderId: 'order2', sku: 'combo' }));

    const call = updateOrderCalls.find((c) => c.id === 'order2');
    expect(call.updates.paymentIntentId).toBe('txid-novo-combo');
    expect(call.updates.previousPaymentIntentIds).toEqual(['txid-antigo-audio-only']);
  });

  it('não duplica o histórico quando o txid gerado é o mesmo já persistido', async () => {
    store['order3'] = { paymentIntentId: 'txid-mesmo' };
    createPixChargeMock.mockResolvedValue({ txid: 'txid-mesmo', pixCopiaECola: 'copia-cola-3' });

    await POST(makeRequest({ orderId: 'order3', sku: 'audio_only' }));

    const call = updateOrderCalls.find((c) => c.id === 'order3');
    expect(call.updates.paymentIntentId).toBe('txid-mesmo');
    expect(call.updates.previousPaymentIntentIds).toEqual([]);
  });
});
