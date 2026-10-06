import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../src/app/api/admin/whatsapp-usage/route.js';

vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(),
}));

import { requireAdmin } from '@/lib/auth';

describe('GET /api/admin/whatsapp-usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bloqueia requisição se não for admin', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: false, status: 401, error: 'Não autorizado' });

    const req = new Request('https://nsmusic.ia.br/api/admin/whatsapp-usage');
    const res = await GET(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Não autorizado');
  });

  it('retorna volumetria e custos de WhatsApp com sucesso', async () => {
    requireAdmin.mockResolvedValueOnce({ ok: true, email: 'admin@nsmusic.ia.br' });

    process.env.WHATSAPP_ACCESS_TOKEN = 'test-wa-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = '1266330313237394';

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url) => {
      if (String(url).includes('analytics')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            analytics: {
              data_points: [
                { start: Math.floor(Date.now() / 1000) - 3600, sent: 20, delivered: 20 },
              ],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          display_phone_number: '+55 94 8126-2610',
          quality_rating: 'GREEN',
          status: 'CONNECTED',
          messaging_limit_tier: 'TIER_250',
          health_status: { can_send_message: 'AVAILABLE' },
        }),
      });
    });

    try {
      const req = new Request('https://nsmusic.ia.br/api/admin/whatsapp-usage', {
        headers: { Authorization: 'Bearer valid-token' },
      });
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.sentLast24h).toBe(20);
      expect(json.limitTier).toBe(250);
      expect(json.remainingLast24h).toBe(230);
      expect(json.costLast24hBrl).toBe(3.8); // 20 * 0.19
      expect(json.qualityRating).toBe('GREEN');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
