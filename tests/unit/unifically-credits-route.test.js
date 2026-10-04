import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../src/app/api/admin/unifically-credits/route.js';

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth';

describe('GET /api/admin/unifically-credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia requisição se não for admin', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: false, status: 401, error: 'Não autorizado' });

    const req = new Request('https://nsmusic.nsnexus.com.br/api/admin/unifically-credits');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Não autorizado');
  });

  it('retorna os créditos com sucesso da Unifically', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: true, email: 'admin@nsmusic.com' });
    process.env.UNIFICALLY_API_KEY = 'test-unif-key';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        code: 200,
        data: {
          user_id: 1234,
          balance_usd: 15.75,
          email: 'admin@unifically.com'
        }
      }),
    });

    const req = new Request('https://nsmusic.nsnexus.com.br/api/admin/unifically-credits', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.balance_usd).toBe(15.75);
    expect(json.email).toBe('admin@unifically.com');
  });

  it('retorna erro 500 se UNIFICALLY_API_KEY não estiver configurada', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: true, email: 'admin@nsmusic.com' });
    delete process.env.UNIFICALLY_API_KEY;

    const req = new Request('https://nsmusic.nsnexus.com.br/api/admin/unifically-credits');
    const res = await GET(req);
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });
});
