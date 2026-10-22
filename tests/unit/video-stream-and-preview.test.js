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

const { buildPublicPreviewVideoUrl, normalizeVpsVideoUrl } = await import('@/lib/videoPreview');
const { GET: getVideoStream, HEAD: headVideoStream, OPTIONS: optionsVideoStream } = await import('@/app/api/video/stream/[filename]/route');

describe('videoPreview utility', () => {
  it('normaliza URL da VPS removendo porta :3100 e IP', () => {
    expect(normalizeVpsVideoUrl('http://81.17.98.66:3100')).toBe('https://evolution.nsnexus.com.br/video');
    expect(normalizeVpsVideoUrl('')).toBe('https://evolution.nsnexus.com.br/video');
    expect(normalizeVpsVideoUrl('https://custom.vps.com/')).toBe('https://custom.vps.com');
  });

  it('constrói URL canônica pública de streaming no próprio domínio', () => {
    expect(buildPublicPreviewVideoUrl('order-123')).toContain('/api/video/stream/preview_order-123.mp4');
    expect(buildPublicPreviewVideoUrl('')).toBe('');
  });
});

describe('GET /api/video/stream/[filename]', () => {
  beforeEach(() => {
    mockEnv = {};
    mockOrders = {};
    vi.restoreAllMocks();
  });

  it('retorna 400 se filename estiver ausente ou vazio', async () => {
    const req = new Request('http://localhost/api/video/stream/');
    const res = await getVideoStream(req, { params: { filename: '' } });
    expect(res.status).toBe(400);
  });

  it('retorna 404 se pedido não existir', async () => {
    const req = new Request('http://localhost/api/video/stream/preview_ord-none.mp4');
    const res = await getVideoStream(req, { params: { filename: 'preview_ord-none.mp4' } });
    expect(res.status).toBe(404);
  });

  it('retorna 204 com cabeçalhos de CORS no OPTIONS', async () => {
    const res = await optionsVideoStream();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });

  it('serve vídeo diretamente do R2 binding quando disponível', async () => {
    mockOrders['ord-r2'] = {
      id: 'ord-r2',
      previewVideoUrl: 'https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev/videos/preview_ord-r2.mp4',
    };

    const fakeVideoBuffer = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    mockEnv.nsmusic_media = {
      get: vi.fn().mockResolvedValue({
        size: 8,
        httpMetadata: { contentType: 'video/mp4' },
        body: fakeVideoBuffer,
      }),
    };

    const req = new Request('http://localhost/api/video/stream/preview_ord-r2.mp4');
    const res = await getVideoStream(req, { params: { filename: 'preview_ord-r2.mp4' } });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
  });

  it('responde 206 Partial Content quando Range header é requisitado via R2', async () => {
    mockOrders['ord-range'] = {
      id: 'ord-range',
      previewVideoUrl: 'https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev/videos/preview_ord-range.mp4',
    };

    const fakeSlice = new Uint8Array([0, 1, 2, 3]);
    mockEnv.nsmusic_media = {
      get: vi.fn().mockResolvedValue({
        size: 100,
        range: { offset: 0, length: 4 },
        httpMetadata: { contentType: 'video/mp4' },
        body: fakeSlice,
      }),
    };

    const req = new Request('http://localhost/api/video/stream/preview_ord-range.mp4', {
      headers: { Range: 'bytes=0-3' },
    });
    const res = await getVideoStream(req, { params: { filename: 'preview_ord-range.mp4' } });

    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-3/100');
    expect(res.headers.get('Content-Length')).toBe('4');
  });
});
