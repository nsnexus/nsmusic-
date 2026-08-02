import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '@/lib/httpRetry';

// B-08 no AUDIT_REPORT.md: retry com backoff nas chamadas a provedores externos (webhook/polling de
// pagamento) — erro de rede/5xx tenta de novo, erro 4xx (ex: recurso não encontrado) não repete.

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

  it('usa o fetchImpl injetado em vez do fetch global quando informado', async () => {
    const customFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const res = await fetchWithRetry('https://example.com', {}, 2, customFetch);
    expect(res.ok).toBe(true);
    expect(customFetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
