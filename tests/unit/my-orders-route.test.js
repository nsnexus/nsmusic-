import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockSupabaseData = [];
let capturedFilters = [];

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} })
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => {
      capturedFilters = [];
      const builder = {
        select: function () { return this; },
        is: function (col, val) { capturedFilters.push({ method: 'is', col, val }); return this; },
        neq: function (col, val) { capturedFilters.push({ method: 'neq', col, val }); return this; },
        eq: function (col, val) { capturedFilters.push({ method: 'eq', col, val }); return this; },
        ilike: function (col, val) { capturedFilters.push({ method: 'ilike', col, val }); return this; },
        in: function (col, val) { capturedFilters.push({ method: 'in', col, val }); return this; },
        or: function (filterStr) { capturedFilters.push({ method: 'or', filterStr }); return this; },
        order: function () { return this; },
        limit: function () { return this; },
        then: function (resolve) {
          resolve({ data: mockSupabaseData, error: null });
        }
      };
      return builder;
    }
  }))
}));

const { GET } = await import('@/app/api/orders/my-orders/route');

beforeEach(() => {
  mockSupabaseData = [
    {
      id: 'order-1',
      order_number: 'NS-1111-2026',
      customer_name: 'Carlos',
      customer_phone: '(19) 99218-1903',
      payment_status: 'PAGO',
      production_status: 'AUDIO_GERADO',
      created_at: '2026-09-25T15:00:00.000Z'
    }
  ];
});

describe('GET /api/orders/my-orders', () => {
  it('rejeita requisições sem parâmetros com 400', async () => {
    const req = new Request('http://localhost/api/orders/my-orders');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('busca por telefone usando in() com customer_phone', async () => {
    const req = new Request('http://localhost/api/orders/my-orders?phone=19992181903');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orders).toHaveLength(1);
    expect(json.orders[0].orderNumber).toBe('NS-1111-2026');

    const inFilter = capturedFilters.find(f => f.method === 'in');
    expect(inFilter).toBeDefined();
    expect(inFilter.col).toBe('customer_phone');
    expect(inFilter.val).toContain('(19) 99218-1903');
  });

  it('busca por order number ou id', async () => {
    const req = new Request('http://localhost/api/orders/my-orders?order=NS-1111-2026');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.orders).toHaveLength(1);

    const orFilter = capturedFilters.find(f => f.method === 'or');
    expect(orFilter).toBeDefined();
    expect(orFilter.filterStr).toContain('order_number.eq.NS-1111-2026');
  });

  it('busca por email com ilike', async () => {
    const req = new Request('http://localhost/api/orders/my-orders?email=carlos@email.com');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const ilikeFilter = capturedFilters.find(f => f.method === 'ilike');
    expect(ilikeFilter).toBeDefined();
    expect(ilikeFilter.col).toBe('customer_email');
    expect(ilikeFilter.val).toBe('carlos@email.com');
  });
});
