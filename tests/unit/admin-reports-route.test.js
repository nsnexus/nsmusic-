import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockSupabaseOrdersData = [];
let mockVendasData = [];
let mockProducaoData = [];
let mockOrdersSummaryData = [];

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
    from: (table) => ({
      select: function () { return this; },
      is: function () { return this; },
      neq: function () { return this; },
      gte: function () { return this; },
      lte: function () { return this; },
      or: function () { return this; },
      order: function () { return this; },
      limit: function () { return this; },
      offset: function () { return this; },
      then: function (resolve) {
        if (table === 'vendas_por_dia') {
          resolve({ data: mockVendasData, error: null });
        } else if (table === 'producao_por_dia') {
          resolve({ data: mockProducaoData, error: null });
        } else if (table === 'orders' && mockOrdersSummaryData.length > 0) {
          resolve({ data: mockOrdersSummaryData, error: null });
        } else {
          resolve({ data: mockSupabaseOrdersData, error: null });
        }
      }
    })
  }))
}));

const { GET } = await import('@/app/api/admin/reports/route');

beforeEach(() => {
  mockAdminOk = true;
  mockVendasData = [];
  mockProducaoData = [];
  mockOrdersSummaryData = [];
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

describe('GET /api/admin/reports?tipo=faturamento', () => {
  it('isola gastos de Kie.ai e reporta musicas geradas pelo robô local com economia', async () => {
    mockVendasData = [{ faturamento: 250, pedidos_pagos: 10 }];
    mockProducaoData = [{ geracoes: 10, pedidos_criados: 10 }];
    mockOrdersSummaryData = [
      { suno_provider: 'suno_local', suno_generation_count: 4 },
      { suno_provider: 'kie', suno_generation_count: 6 },
    ];

    const req = new Request('http://localhost/api/admin/reports?tipo=faturamento');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.faturamentoTotal).toBe(250);
    expect(json.vendasCount).toBe(10);
    expect(json.geracoesTotal).toBe(10);
    expect(json.geracoesBot).toBe(4);
    expect(json.geracoesKie).toBe(6);
    expect(json.gastoKie).toBeCloseTo(1.80, 2);
    expect(json.gastoGeracao).toBeCloseTo(1.80, 2);
    expect(json.economiaBot).toBeCloseTo(1.20, 2);
  });
});
