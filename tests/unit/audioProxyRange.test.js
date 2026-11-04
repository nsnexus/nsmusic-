import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/audio/proxy/route';

describe('GET /api/audio/proxy — Range Requests e Duração do Áudio', () => {
  it('responde 206 Partial Content quando cabeçalho Range é fornecido', async () => {
    const fakeAudioBytes = new Uint8Array(100).fill(42);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { locked: false },
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '100',
      }),
      arrayBuffer: async () => fakeAudioBytes.buffer,
    });

    const req = new Request('https://nsmusic.pages.dev/api/audio/proxy?url=https://tempfile.aiquickdraw.com/r/abc.mp3', {
      headers: {
        range: 'bytes=0-9',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-9/100');
    expect(res.headers.get('content-length')).toBe('10');
    expect(res.headers.get('accept-ranges')).toBe('bytes');

    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(10);
  });

  it('responde 200 completo quando nenhum Range é fornecido', async () => {
    const fakeAudioBytes = new Uint8Array(50).fill(1);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { locked: false },
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '50',
      }),
      arrayBuffer: async () => fakeAudioBytes.buffer,
    });

    const req = new Request('https://nsmusic.pages.dev/api/audio/proxy?url=https://tempfile.aiquickdraw.com/r/abc.mp3');

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('50');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
  });

  it('responde 416 Range Not Satisfiable quando range é inválido ou fora dos limites', async () => {
    const fakeAudioBytes = new Uint8Array(50).fill(1);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body: { locked: false },
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '50',
      }),
      arrayBuffer: async () => fakeAudioBytes.buffer,
    });

    const req = new Request('https://nsmusic.pages.dev/api/audio/proxy?url=https://tempfile.aiquickdraw.com/r/abc.mp3', {
      headers: {
        range: 'bytes=100-200',
      },
    });

    const res = await GET(req);
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */50');
  });
});
