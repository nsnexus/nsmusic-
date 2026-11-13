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

const { GET, normalizeDateBounds } = await import('@/app/api/admin/orders/route');

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
    },
    {
      id: 'order-2-bonus',
      order_number: 'NS-2222-2026',
      customer_name: 'Marcos Bonus',
      customer_phone: '11988887777',
      payment_status: 'PAGO',
      production_status: 'AUDIO_GERADO',
      created_at: '2026-09-25T16:00:00.000Z',
      extras: { isSecondGeneration: true }
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

  it('retorna pedidos mapeados em camelCase a partir do Supabase e oculta bônus por padrão (generationType=MAIN)', async () => {
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

  it('retorna apenas pedidos bônus quando generationType=BONUS', async () => {
    const req = new Request('http://localhost/api/admin/orders?generationType=BONUS');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(1);
    expect(json.orders[0].id).toBe('order-2-bonus');
    expect(json.orders[0].isBonusOrder).toBe(true);
  });

  it('retorna principais e bônus juntos quando generationType=ALL', async () => {
    const req = new Request('http://localhost/api/admin/orders?generationType=ALL');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.orders).toHaveLength(2);
    expect(json.orders.map(o => o.id)).toEqual(['order-1', 'order-2-bonus']);
  });
});

describe('normalizeDateBounds', () => {
  it('cobre as 24 horas completas do dia quando apenas dateFrom é informado', () => {
    const { fromIso, toIso } = normalizeDateBounds('2026-11-05', '');
    expect(fromIso).toBe('2026-11-05T00:00:00-03:00');
    expect(toIso).toBe('2026-11-05T23:59:59.999-03:00');
  });

  it('normaliza intervalo dateFrom e dateTo', () => {
    const { fromIso, toIso } = normalizeDateBounds('2026-11-01', '2026-11-05');
    expect(fromIso).toBe('2026-11-01T00:00:00-03:00');
    expect(toIso).toBe('2026-11-05T23:59:59.999-03:00');
  });

  it('inverte automaticamente se dateFrom for maior que dateTo', () => {
    const { fromIso, toIso } = normalizeDateBounds('2026-11-05', '2026-11-01');
    expect(fromIso).toBe('2026-11-01T00:00:00-03:00');
    expect(toIso).toBe('2026-11-05T23:59:59.999-03:00');
  });

  it('extrai parte de data quando ISO string é passada', () => {
    const { fromIso, toIso } = normalizeDateBounds('2026-11-05T03:00:00.000Z', '');
    expect(fromIso).toBe('2026-11-05T00:00:00-03:00');
    expect(toIso).toBe('2026-11-05T23:59:59.999-03:00');
  });

  it('retorna null quando nenhuma data é informada', () => {
    const { fromIso, toIso } = normalizeDateBounds('', '');
    expect(fromIso).toBeNull();
    expect(toIso).toBeNull();
  });
});
