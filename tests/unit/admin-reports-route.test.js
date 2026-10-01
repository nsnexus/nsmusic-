import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockSupabaseOrdersData = [];

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => mockAdminOk
    ? { ok: true, email: 'narcisofelizardo@gmail.com' }
    : { ok: false, status: 401, error: 'Unauthorized' }
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} })
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: function () { return this; },
      is: function () { return this; },
      gte: function () { return this; },
      lte: function () { return this; },
      or: function () { return this; },
      order: function () { return this; },
      limit: function () { return this; },
      offset: function () { return this; },
      then: function (resolve) {
        resolve({ data: mockSupabaseOrdersData, error: null });
      }
    })
  }))
}));

const { GET } = await import('@/app/api/admin/reports/route');

beforeEach(() => {
  mockAdminOk = true;
  mockSupabaseOrdersData = [
    {
      id: 'order-recent-1',
      order_number: 'NS-9999-2026',
      customer_phone: '11988887777',
      payment_status: 'PAGO',
      paid_at: '2026-10-01T09:00:00.000Z',
      created_at: '2026-10-01T08:50:00.000Z',
      has_video_access: false,
      has_carta_access: false,
      has_playback_access: false,
      has_retrospectiva_access: false,
      extras: {}
    }
  ];
});

describe('GET /api/admin/reports?tipo=pedidos_recentes', () => {
  it('rejeita requisições não autorizadas com 401', async () => {
    mockAdminOk = false;
    const req = new Request('http://localhost/api/admin/reports?tipo=pedidos_recentes&dias=8');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('retorna lista de pedidos recentes para o ritmo de vendas intradiário', async () => {
    const req = new Request('http://localhost/api/admin/reports?tipo=pedidos_recentes&dias=8');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.dias).toBe(8);
    expect(json.total).toBe(1);
    expect(json.pedidos).toHaveLength(1);
    expect(json.pedidos[0].id).toBe('order-recent-1');
    expect(json.pedidos[0].orderNumber).toBe('NS-9999-2026');
    expect(json.pedidos[0].paymentStatus).toBe('PAGO');
  });
});
