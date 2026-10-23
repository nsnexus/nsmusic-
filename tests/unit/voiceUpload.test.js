import { describe, it, expect, vi } from 'vitest';

let mockEnv = {};

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: mockEnv })
}));

const { POST } = await import('@/app/api/admin/voice/upload/route');

describe('/api/admin/voice/upload route', () => {
  it('retorna 503 se Cloudflare R2 não estiver configurado', async () => {
    mockEnv = {};
    const formData = new FormData();
    formData.append('file', new Blob(['test'], { type: 'audio/mpeg' }), 'test.mp3');

    const req = new Request('http://localhost/api/admin/voice/upload', {
      method: 'POST',
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/Cloudflare R2/i);
  });

  it('salva com extensão wav e contentType audio/wav quando o arquivo tem cabeçalho RIFF, mesmo com nome .webm', async () => {
    let putPath = '';
    let putMeta = null;
    const mockR2 = {
      put: vi.fn(async (path, buffer, options) => {
        putPath = path;
        putMeta = options;
      })
    };

    mockEnv = {
      nsmusic_media: mockR2,
      R2_PUBLIC_URL: 'https://r2.nsmusic.com.br'
    };

    // Buffer com cabeçalho RIFF (0x52, 0x49, 0x46, 0x46)
    const riffBuffer = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45]);
    const formData = new FormData();
    formData.append('file', new Blob([riffBuffer], { type: 'audio/webm' }), 'amostra.webm');

    const req = new Request('http://localhost/api/admin/voice/upload', {
      method: 'POST',
      body: formData
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.contentType).toBe('audio/wav');
    expect(json.filename).toMatch(/\.wav$/);
    expect(putPath).toMatch(/\.wav$/);
    expect(putMeta.httpMetadata.contentType).toBe('audio/wav');
  });
});
