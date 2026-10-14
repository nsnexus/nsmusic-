import { describe, it, expect, vi } from 'vitest';
import { POST } from '@/app/api/admin/voice/upload/route';

describe('/api/admin/voice/upload route', () => {
  it('retorna 503 se Cloudflare R2 não estiver configurado', async () => {
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
});
