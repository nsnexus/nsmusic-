import { describe, it, expect, vi } from 'vitest';

let mockR2Storage = {};

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({
    env: {
      R2_PUBLIC_URL: 'https://media.nsnexus.com.br',
      nsmusic_media: {
        put: async (path, buffer, opts) => {
          mockR2Storage[path] = { buffer, opts };
          return {};
        }
      }
    }
  })
}));

const { POST } = await import('@/app/api/media/upload/route');

describe('POST /api/media/upload', () => {
  it('rejeita requisições sem arquivo com 400', async () => {
    const formData = new FormData();
    const req = new Request('http://localhost/api/media/upload', {
      method: 'POST',
      body: formData
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('salva imagem válida no Cloudflare R2 e devolve URL pública', async () => {
    const blob = new Blob(['fake image bytes content here'], { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', blob, 'foto.jpg');

    const req = new Request('http://localhost/api/media/upload?folder=slideshow&orderId=order-123', {
      method: 'POST',
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.url).toMatch(/^https:\/\/media\.nsnexus\.com\.br\/slideshow\/order-123\/\d+_[a-z0-9]+\.jpg$/);
    expect(Object.keys(mockR2Storage).length).toBe(1);
  });
});
