import { describe, expect, it, vi, beforeEach } from 'vitest';

let admin = { ok: true };
vi.mock('@/lib/auth', () => ({ requireAdmin: async () => admin }));

const { GET, PUT } = await import('../../src/app/api/admin/us-countries/route.js');

describe('/api/admin/us-countries', () => {
  beforeEach(() => {
    admin = { ok: true };
    process.env.US_PANEL_TOKEN = 't'.repeat(40);
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ countries: [{ code: 'US' }], defaults: [] }), { status: 200 }));
  });

  it('blocks non-admins before calling the US site', async () => {
    admin = { ok: false, status: 403, error: 'no' };
    expect((await GET(new Request('https://br.test/api/admin/us-countries'))).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards with the shared token', async () => {
    const res = await GET(new Request('https://br.test/api/admin/us-countries'));
    expect(res.status).toBe(200);
    expect(fetch.mock.calls[0][1].headers['x-panel-token']).toBe('t'.repeat(40));
  });

  it('fails clearly without the token', async () => {
    delete process.env.US_PANEL_TOKEN;
    expect((await GET(new Request('https://br.test/api/admin/us-countries'))).status).toBe(500);
  });

  it('only forwards the countries field', async () => {
    await PUT(new Request('https://br.test/x', { method: 'PUT', body: JSON.stringify({ countries: [], extra: 1 }) }));
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ countries: [] });
  });
});
