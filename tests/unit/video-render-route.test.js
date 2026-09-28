import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockEnv = {};
let mockOrders = {};

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: mockEnv }),
}));

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (orderId) => mockOrders[orderId] || null),
  updateOrder: vi.fn(async (orderId, updates) => {
    if (mockOrders[orderId]) {
      Object.assign(mockOrders[orderId], updates);
    }
    return mockOrders[orderId];
  }),
}));

const { POST } = await import('@/app/api/video/render/route');

describe('POST /api/video/render', () => {
  beforeEach(() => {
    mockEnv = {};
    mockOrders = {};
    vi.restoreAllMocks();
  });

  it('retorna vpsEnabled: false quando VPS_VIDEO_URL não está configurada', async () => {
    mockEnv.VPS_VIDEO_URL = '';
    const req = new Request('http://localhost/api/video/render', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'ord-1' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.vpsEnabled).toBe(false);
  });

  it('retorna 400 se orderId for inválido', async () => {
    mockEnv.VPS_VIDEO_URL = 'https://vps.example.com';
    const req = new Request('http://localhost/api/video/render', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('retorna 404 se pedido não existir', async () => {
    mockEnv.VPS_VIDEO_URL = 'https://vps.example.com';
    const req = new Request('http://localhost/api/video/render', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'ord-inexistente' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('retorna 403 se pedido não tiver acesso a vídeo', async () => {
    mockEnv.VPS_VIDEO_URL = 'https://vps.example.com';
    mockOrders['ord-sem-video'] = {
      id: 'ord-sem-video',
      hasVideoAccess: false,
      videoAddonPaid: false,
    };

    const req = new Request('http://localhost/api/video/render', {
      method: 'POST',
      body: JSON.stringify({ orderId: 'ord-sem-video' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('chama a VPS e retorna 202 quando pedido é válido e pago', async () => {
    mockEnv.VPS_VIDEO_URL = 'https://vps.example.com';
    mockEnv.VPS_VIDEO_SECRET = 'secret-123';
    mockOrders['ord-ok'] = {
      id: 'ord-ok',
      hasVideoAccess: true,
      audioUrl: 'https://media.example.com/audio.mp3',
      slideshowImages: ['https://media.example.com/img1.jpg'],
      customerName: 'Cliente Teste',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (url.includes('/render')) {
        return new Response(JSON.stringify({ success: true, queuePosition: 1 }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return originalFetch(url, opts);
    });

    try {
      const req = new Request('http://localhost/api/video/render', {
        method: 'POST',
        body: JSON.stringify({
          orderId: 'ord-ok',
          imageUrls: ['https://media.example.com/img1.jpg'],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(202);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.vpsEnabled).toBe(true);
      expect(mockOrders['ord-ok'].videoStatus).toBe('GERANDO');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
