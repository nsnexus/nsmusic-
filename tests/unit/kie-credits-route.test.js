import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../src/app/api/admin/kie-credits/route.js';

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth';

describe('GET /api/admin/kie-credits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia requisição se não for admin', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: false, status: 401, error: 'Não autorizado' });

    const req = new Request('https://nsmusic.ia.br/api/admin/kie-credits');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Não autorizado');
  });

  it('retorna os créditos com sucesso da Kie.ai', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: true, email: 'narcisofelizardo@gmail.com' });

    process.env.KIE_API_KEY = 'test-kie-key';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 200, msg: 'success', data: 2450 }),
    });

    const req = new Request('https://nsmusic.ia.br/api/admin/kie-credits', {
      headers: { Authorization: 'Bearer valid-token' },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.credits).toBe(2450);
  });

  it('trata erro se Kie.ai responder com erro', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: true, email: 'narcisofelizardo@gmail.com' });
    process.env.KIE_API_KEY = 'test-kie-key';

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ code: 401, msg: 'Invalid API Key' }),
    });

    const req = new Request('https://nsmusic.ia.br/api/admin/kie-credits');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe('Invalid API Key');
  });
});
