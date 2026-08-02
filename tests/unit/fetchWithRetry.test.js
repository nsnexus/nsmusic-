import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// B-08 no AUDIT_REPORT.md: retry com backoff na consulta ao Mercado Pago dentro do webhook —
// erro de rede/5xx tenta de novo, erro 4xx (ex: pagamento não encontrado) não adianta repetir.

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));
vi.mock('@/lib/payments', () => ({ applyPaymentApproval: vi.fn() }));
vi.mock('firebase/firestore/lite', () => ({
  doc: () => ({}),
  getDoc: async () => ({ exists: () => false }),
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  getDocs: async () => ({ empty: true, docs: [] }),
}));

const { fetchWithRetry } = await import('@/app/api/webhooks/mercadopago/route');

describe('fetchWithRetry', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('retorna de primeira quando a resposta é ok', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200 });
    const res = await fetchWithRetry('https://example.com', {});
    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('não tenta de novo em erro 4xx (não adianta repetir)', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 404 });
    const res = await fetchWithRetry('https://example.com', {}, 2);
    expect(res.status).toBe(404);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo em erro 5xx até acertar', async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const res = await fetchWithRetry('https://example.com', {}, 2);
    expect(res.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('lança o último erro depois de esgotar as tentativas', async () => {
    global.fetch.mockRejectedValue(new Error('network down'));
    await expect(fetchWithRetry('https://example.com', {}, 1)).rejects.toThrow('network down');
    expect(global.fetch).toHaveBeenCalledTimes(2); // tentativa inicial + 1 retry
  });
});
