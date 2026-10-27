import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockAdminOk = true;
let mockFetchResponses = {};

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => mockAdminOk
    ? { ok: true, email: 'narcisofelizardo@gmail.com' }
    : { ok: false, status: 401, error: 'Unauthorized' }
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key'
    }
  })
}));

const { GET, POST } = await import('@/app/api/admin/accounts/route');

beforeEach(() => {
  mockAdminOk = true;
  mockFetchResponses = {};

  global.fetch = vi.fn(async (url, opts = {}) => {
    const urlStr = String(url);
    const method = opts.method || 'GET';

    // List users
    if (urlStr.includes('/auth/v1/admin/users')) {
      return {
        ok: true,
        json: async () => ({
          users: [
            {
              id: 'user-123',
              email: 'cliente@exemplo.com',
              phone: '11999998888',
              user_metadata: { name: 'Cliente Teste' },
              created_at: '2026-09-01T00:00:00.000Z'
            }
          ]
        })
      };
    }

    // Credit ledger
    if (urlStr.includes('/rest/v1/credit_ledger')) {
      return {
        ok: true,
        json: async () => [
          { user_id: 'user-123', amount: 5, reason: 'compra', created_at: '2026-09-01T00:00:00.000Z' }
        ]
      };
    }

    // Orders query
    if (urlStr.includes('/rest/v1/orders')) {
      if (method === 'PATCH') {
        const body = JSON.parse(opts.body || '{}');
        return {
          ok: true,
          json: async () => [
            {
              id: 'order-abc',
              order_number: 'NS-1234',
              user_id: body.user_id,
              customer_name: 'Cliente Teste',
              honoree_name: 'Homenageado Teste'
            }
          ]
        };
      }

      // GET with filter
      if (urlStr.includes('order-inexistente')) {
        return {
          ok: true,
          json: async () => []
        };
      }

      return {
        ok: true,
        json: async () => [
          {
            id: 'order-abc',
            order_number: 'NS-1234',
            user_id: null,
            customer_name: 'Cliente Teste',
            customer_email: 'cliente@exemplo.com',
            customer_phone: '11999998888',
            honoree_name: 'Homenageado Teste',
            music_style: 'Sertanejo',
            payment_status: 'PAGO',
            production_status: 'FINALIZADO',
            audio_files: ['https://cdn.example.com/audio.mp3'],
            created_at: '2026-09-02T00:00:00.000Z'
          }
        ]
      };
    }

    return {
      ok: true,
      json: async () => ({})
    };
  });
});

describe('POST /api/admin/accounts - link_order e unlink_order', () => {
  it('rejeita com 401 se admin não autorizado', async () => {
    mockAdminOk = false;
    const req = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'link_order' })
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('exige userId e orderIdentifier para link_order', async () => {
    const req1 = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'link_order', orderIdentifier: 'NS-1234' })
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);

    const req2 = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'link_order', userId: 'user-123' })
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
  });

  it('retorna 404 se o pedido não for encontrado ao vincular', async () => {
    const req = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'link_order', userId: 'user-123', orderIdentifier: 'order-inexistente' })
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('vincula o pedido à conta com sucesso via link_order', async () => {
    const req = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'link_order', userId: 'user-123', orderNumber: 'NS-1234' })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('vinculado com sucesso');
    expect(json.order.userId).toBe('user-123');
  });

  it('desvincula o pedido com sucesso via unlink_order', async () => {
    const req = new Request('http://localhost/api/admin/accounts', {
      method: 'POST',
      body: JSON.stringify({ action: 'unlink_order', orderIdentifier: 'NS-1234' })
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message).toContain('desvinculado com sucesso');
  });
});
