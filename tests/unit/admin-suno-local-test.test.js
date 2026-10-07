import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockInsertResult = { error: null };
let mockSelectResult = { data: null, error: null };

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
      insert: async (data) => mockInsertResult,
      select: function () { return this; },
      eq: function () { return this; },
      maybeSingle: async () => mockSelectResult
    })
  }))
}));

const { POST, GET } = await import('@/app/api/admin/suno-local/test/route');

beforeEach(() => {
  mockAdminOk = true;
  mockInsertResult = { error: null };
  mockSelectResult = {
    data: {
      id: 'teste-123',
      orderNumber: 'TEST-123456',
      status_robo: 'PENDENTE_ROBO',
      musicUrl: null
    },
    error: null
  };
});

describe('/api/admin/suno-local/test', () => {
  it('POST bloqueia requisição não autorizada com 401', async () => {
    mockAdminOk = false;
    const req = new Request('http://localhost/api/admin/suno-local/test', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST cria pedido de teste com status_robo PENDENTE_ROBO', async () => {
    const req = new Request('http://localhost/api/admin/suno-local/test', { method: 'POST' });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.orderId).toContain('teste-robo-');
  });

  it('GET retorna status do pedido de teste', async () => {
    const req = new Request('http://localhost/api/admin/suno-local/test?orderId=teste-123', { method: 'GET' });
    const res = await GET(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.order.id).toBe('teste-123');
  });

  it('GET retorna 400 se orderId não for fornecido', async () => {
    const req = new Request('http://localhost/api/admin/suno-local/test', { method: 'GET' });
    const res = await GET(req);
    expect(res.status).toBe(400);
  });
});
