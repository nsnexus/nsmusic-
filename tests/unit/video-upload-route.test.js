import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(),
  updateOrder: vi.fn(),
}));

let mockPutCalled = false;
vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({
    env: {
      R2_PUBLIC_URL: 'https://media.nsnexus.com.br',
      nsmusic_media: {
        put: async () => {
          mockPutCalled = true;
          return {};
        }
      }
    }
  })
}));

import { POST } from '@/app/api/video/upload/route';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

function createRequest(orderId, ext = 'mp4') {
  const blob = new Blob(['video payload bytes'], { type: 'video/mp4' });
  return new Request(`https://nsmusic.com.br/api/video/upload?orderId=${orderId}&ext=${ext}`, {
    method: 'POST',
    headers: { 'Content-Type': 'video/mp4' },
    body: blob,
  });
}

describe('POST /api/video/upload (S08)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPutCalled = false;
  });

  it('retorna 404 para pedido inexistente', async () => {
    getOrder.mockResolvedValue(null);
    const res = await POST(createRequest('ord-inexistente'));
    expect(res.status).toBe(404);
  });

  it('BLOQUEIA com 403 pedido que não pagou pelo recurso de vídeo', async () => {
    getOrder.mockResolvedValue({
      id: 'ord-sem-video',
      paymentStatus: 'PAGAMENTO_APROVADO',
      hasVideoAccess: false,
      videoAddonPaid: false,
      package: 'audio_only',
    });

    const res = await POST(createRequest('ord-sem-video'));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('não contratado');
    expect(mockPutCalled).toBe(false);
  });

  it('permite upload para pedido com hasVideoAccess e gera URL com timestamp versionado', async () => {
    getOrder.mockResolvedValue({
      id: 'ord-com-video',
      hasVideoAccess: true,
      package: 'combo',
    });
    updateOrder.mockResolvedValue({ success: true });

    const res = await POST(createRequest('ord-com-video'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.url).toMatch(/^https:\/\/media\.nsnexus\.com\.br\/videos\/ord-com-video\/video_\d+\.mp4$/);
    expect(mockPutCalled).toBe(true);
    expect(updateOrder).toHaveBeenCalledWith('ord-com-video', expect.objectContaining({
      videoStatus: 'CONCLUIDO'
    }), expect.any(Object));
  });
});
