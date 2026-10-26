import { describe, it, expect, vi } from 'vitest';

let mockR2Storage = {};

const mockDeletedKeys = [];

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({
    env: {
      R2_PUBLIC_URL: 'https://media.nsnexus.com.br',
      nsmusic_media: {
        put: async (path, buffer, opts) => {
          mockR2Storage[path] = { buffer, opts };
          return {};
        },
        delete: async (path) => {
          mockDeletedKeys.push(path);
          return {};
        }
      }
    }
  })
}));

const { POST, DELETE } = await import('@/app/api/media/upload/route');

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

  it('aceita arquivos de celulares com MIME application/octet-stream ou pjpeg detectando extensão', async () => {
    const blob = new Blob(['fake image content'], { type: 'application/octet-stream' });
    const formData = new FormData();
    formData.append('file', blob, 'FOTO_CAMERA.JPG');

    const req = new Request('http://localhost/api/media/upload?folder=slideshow&orderId=order-456', {
      method: 'POST',
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.url).toMatch(/^https:\/\/media\.nsnexus\.com\.br\/slideshow\/order-456\/\d+_[a-z0-9]+\.jpg$/);
  });

  it('rejeita tipos inválidos não suportados como PDF ou texto', async () => {
    const blob = new Blob(['not an image'], { type: 'application/pdf' });
    const formData = new FormData();
    formData.append('file', blob, 'documento.pdf');

    const req = new Request('http://localhost/api/media/upload?folder=slideshow&orderId=order-789', {
      method: 'POST',
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/media/upload (S06)', () => {
  it('permite deletar fotos do slideshow legítimas', async () => {
    const req = new Request('http://localhost/api/media/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://media.nsnexus.com.br/slideshow/order-123/foto.jpg' })
    });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockDeletedKeys).toContain('slideshow/order-123/foto.jpg');
  });

  it('BLOQUEIA exclusão de arquivos de áudio ou vídeo no R2', async () => {
    const reqAudio = new Request('http://localhost/api/media/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://media.nsnexus.com.br/audios/order-123/v1.mp3' })
    });
    const resAudio = await DELETE(reqAudio);
    expect(resAudio.status).toBe(403);

    const reqVideo = new Request('http://localhost/api/media/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://media.nsnexus.com.br/videos/order-123/video.mp4' })
    });
    const resVideo = await DELETE(reqVideo);
    expect(resVideo.status).toBe(403);
  });

  it('BLOQUEIA URLs de hosts externos ou com traversal', async () => {
    const reqExternal = new Request('http://localhost/api/media/upload', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://attacker.com/slideshow/order-123/foto.jpg' })
    });
    const resExternal = await DELETE(reqExternal);
    expect(resExternal.status).toBe(403);
  });
});
