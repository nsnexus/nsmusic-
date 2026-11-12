import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyAudioToR2 } from '@/lib/audioArchive';
import { inspectMp3Buffer } from '@/lib/mp3XingFix';

function buildBrokenStreamMp3(frameCount = 600) {
  // 600 frames * 192 bytes = 115200 bytes (> 100KB MIN_AUDIO_BYTES)
  const id3Size = 20;
  const frameLen = 192;
  const buf = new Uint8Array(id3Size + frameCount * frameLen);
  buf[0] = 0x49; buf[1] = 0x44; buf[2] = 0x33; buf[3] = 0x04; buf[9] = 10;

  for (let i = 0; i < frameCount; i++) {
    const off = id3Size + i * frameLen;
    buf[off] = 0xff; buf[off + 1] = 0xfb; buf[off + 2] = 0x54; buf[off + 3] = 0x00;
  }

  const xingPos = id3Size + 36;
  buf[xingPos] = 0x58; buf[xingPos + 1] = 0x69; buf[xingPos + 2] = 0x6e; buf[xingPos + 3] = 0x67;
  buf[xingPos + 7] = 0x07; // flags: frames + bytes + TOC, valores zerados (frames=0, bytes=0)
  return buf.buffer;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('audioArchive — integridade no salvamento em R2', () => {
  it('rejeita arquivo truncado quando byteLength não bate com Content-Length', async () => {
    const partial = buildBrokenStreamMp3(600);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': String(partial.byteLength + 50000),
      }),
      arrayBuffer: async () => partial,
    });

    const putMock = vi.fn();
    const res = await copyAudioToR2(
      'https://cdn.unifically.com/audio/test.mp3',
      'audios/ord1/t1-v1.mp3',
      { put: putMock },
      'https://pub-test.r2.dev'
    );

    expect(res.ok).toBe(false);
    expect(res.reason).toContain('origem_truncada');
    expect(putMock).not.toHaveBeenCalled();
  });

  it('repara cabeçalho Xing zerado ao salvar stream no R2', async () => {
    const brokenStream = buildBrokenStreamMp3(600);
    let putBuffer = null;

    globalThis.fetch = vi.fn(async (url) => {
      if (url.includes('audiostream.kie.ai')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'audio/mpeg' }),
          arrayBuffer: async () => brokenStream,
        };
      }
      return { ok: false, status: 404, headers: new Headers() };
    });

    const putMock = vi.fn(async (_key, buf) => {
      putBuffer = buf;
    });

    const res = await copyAudioToR2(
      'https://audiostream.kie.ai/stream/11111111-2222-3333-4444-555555555555.mp3',
      'audios/ord2/t2-v1.mp3',
      { put: putMock },
      'https://pub-test.r2.dev'
    );

    expect(res.ok).toBe(true);
    expect(res.fromStream).toBe(true);
    expect(res.xingRepaired).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);

    const savedInfo = inspectMp3Buffer(putBuffer);
    expect(savedInfo.xingBroken).toBe(false);
    expect(savedInfo.xingFrames).toBe(599);
    expect(savedInfo.xingBytes).toBe(600 * 192);
  });
});

