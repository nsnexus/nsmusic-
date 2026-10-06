import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockConfigRow = {
  chave: 'manual_ads_spend',
  valor: {
    'tiktok_2026-10-05': 40.0,
    'meta_2026-10-05': 120.0,
  },
};
let upsertSpy = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () =>
    mockAdminOk
      ? { ok: true, email: 'admin@nsmusic.com.br' }
      : { ok: false, status: 401, error: 'Não autorizado' },
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} }),
}));

vi.mock('@/lib/adsSpend', () => ({
  getConsolidatedAdsSpend: async ({ since, until }) => ({
    meta: { byDate: { '2026-10-05': 100.0 }, total: 100.0, ok: true },
    tiktok: { byDate: {}, total: 0, ok: false, reason: 'not_configured' },
  }),
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: function () {
        return this;
      },
      eq: function () {
        return this;
      },
      maybeSingle: async function () {
        return { data: mockConfigRow, error: null };
      },
      upsert: async function (payload) {
        upsertSpy(payload);
        return { data: payload, error: null };
      },
    }),
  })),
}));

const { GET, POST } = await import('@/app/api/admin/ads-spend/route');

beforeEach(() => {
  mockAdminOk = true;
  mockConfigRow = {
    chave: 'manual_ads_spend',
    valor: {
      'tiktok_2026-10-05': 40.0,
      'meta_2026-10-05': 120.0,
    },
  };
  upsertSpy = vi.fn();
});

describe('GET /api/admin/ads-spend', () => {
  it('retorna 401 quando não autenticado como admin', async () => {
    mockAdminOk = false;
    const req = new Request('http://localhost/api/admin/ads-spend?mes=2026-10');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('retorna dados consolidados mesclando gastos manuais do TikTok', async () => {
    const req = new Request('http://localhost/api/admin/ads-spend?mes=2026-10');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    // TikTok deve receber o gasto manual
    expect(json.tiktok.byDate['2026-10-05']).toBe(40.0);
    expect(json.tiktok.total).toBe(40.0);
    expect(json.tiktok.ok).toBe(true);
  });
});

describe('POST /api/admin/ads-spend', () => {
  it('salva gasto diário individual do TikTok Ads', async () => {
    const req = new Request('http://localhost/api/admin/ads-spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'tiktok',
        date: '2026-10-06',
        spend: 55.5,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalled();
    const lastCall = upsertSpy.mock.calls[0][0];
    expect(lastCall.chave).toBe('manual_ads_spend');
    expect(lastCall.valor['tiktok_2026-10-06']).toBe(55.5);
  });

  it('salva lote de múltiplos dias do TikTok Ads via entries', async () => {
    const req = new Request('http://localhost/api/admin/ads-spend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: 'tiktok',
        entries: {
          '2026-10-01': 30.0,
          '2026-10-02': 45.0,
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(upsertSpy).toHaveBeenCalled();
    const lastCall = upsertSpy.mock.calls[0][0];
    expect(lastCall.valor['tiktok_2026-10-01']).toBe(30.0);
    expect(lastCall.valor['tiktok_2026-10-02']).toBe(45.0);
  });
});
