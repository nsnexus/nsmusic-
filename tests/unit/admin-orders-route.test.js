import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockSupabaseData = [];

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => mockAdminOk
    ? { ok: true, email: 'narcisofelizardo@gmail.com' }
    : { ok: false, status: 401, error: 'Unauthorized' }
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} })
}));

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  collection: () => ({}),
  query: () => ({}),
  where: () => ({}),
  orderBy: () => ({}),
  limit: () => ({}),
  getDocs: async () => ({
    forEach: (cb) => {
      mockSupabaseData.forEach((d) => cb({ id: d.id, data: () => d }));
    }
  })
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: function () { return this; },
      is: function () { return this; },
      neq: function () { return this; },
      gte: function () { return this; },
      lte: function () { return this; },
      eq: function () { return this; },
      in: function () { return this; },
      or: function () { return this; },
      order: function () { return this; },
      limit: function () { return this; },
      offset: function () { return this; },
      then: function (resolve) {
        resolve({ data: mockSupabaseData, error: null });
      }
    })
  }))
}));

const { GET } = await import('@/app/api/admin/orders/route');

beforeEach(() => {
  mockAdminOk = true;
  mockSupabaseData = [
    {
      id: 'order-1',
      order_number: 'NS-1111-2026',
      customer_name: 'Marcos',
      customer_phone: '11988887777',
      payment_status: 'PAGO',
      production_status: 'AUDIO_GERADO',
      created_at: '2026-09-25T15:00:00.000Z'
    }
  ];
});

describe('GET /api/admin/orders', () => {
  it('rejeita requisições não autorizadas com 401', async () => {
    mockAdminOk = false;
    const req = new Request('http://localhost/api/admin/orders');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('retorna pedidos mapeados em camelCase a partir do Supabase', async () => {
    const req = new Request('http://localhost/api/admin/orders?dateFrom=2026-09-25&dateTo=2026-09-25');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.source).toBe('supabase');
    expect(json.orders).toHaveLength(1);
    expect(json.orders[0].id).toBe('order-1');
    expect(json.orders[0].orderNumber).toBe('NS-1111-2026');
    expect(json.orders[0].customerName).toBe('Marcos');
    expect(json.orders[0].paymentStatus).toBe('PAGO');
  });
});
