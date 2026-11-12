import { describe, it, expect } from 'vitest';
import { inspectMp3Buffer, repairMp3XingHeader, hasBrokenXingHeader } from '@/lib/mp3XingFix';

/**
 * Monta um MP3 sintético válido MPEG-1 Layer III (48000 Hz, Stereo) com tag ID3v2 e cabeçalho Xing.
 */
function buildSyntheticVbrMp3({ frameCount = 10, xingFrames = 0, xingBytes = 0, withId3 = true } = {}) {
  // MPEG1 Layer III, 64kbps (brIdx=5), 48000Hz (srIdx=1), stereo (mode=0) => frameLen = floor(144*64000/48000) = 192 bytes
  // Para ter espaço confortável pro Xing + TOC (4 + 32 + 120 = 156 bytes <= 192), 64kbps@48kHz cabe perfeitamente!
  const id3Size = withId3 ? 20 : 0; // 10 header + 10 body
  const frameLen = 192;
  const totalBytes = id3Size + frameCount * frameLen;
  const buf = new Uint8Array(totalBytes);

  if (withId3) {
    buf[0] = 0x49; buf[1] = 0x44; buf[2] = 0x33; // 'ID3'
    buf[3] = 0x04; buf[4] = 0x00; buf[5] = 0x00;
    buf[6] = 0x00; buf[7] = 0x00; buf[8] = 0x00; buf[9] = 10; // syncsafe 10 bytes
  }

  for (let i = 0; i < frameCount; i++) {
    const off = id3Size + i * frameLen;
    // Sync FF FB, bitrate idx 5 (64kbps -> 0x50), sample rate idx 1 (48000 -> 0x04), stereo (0x00)
    buf[off] = 0xff;
    buf[off + 1] = 0xfb;
    buf[off + 2] = 0x54;
    buf[off + 3] = 0x00;
  }

  // Insere cabeçalho Xing no frame 0 (offset + 4 + 32 = +36)
  const xingPos = id3Size + 36;
  buf[xingPos] = 0x58; buf[xingPos + 1] = 0x69; buf[xingPos + 2] = 0x6e; buf[xingPos + 3] = 0x67; // 'Xing'
  // Flags = 0x07 (frames + bytes + TOC)
  buf[xingPos + 4] = 0x00; buf[xingPos + 5] = 0x00; buf[xingPos + 6] = 0x00; buf[xingPos + 7] = 0x07;

  const dv = new DataView(buf.buffer);
  dv.setUint32(xingPos + 8, xingFrames, false);
  dv.setUint32(xingPos + 12, xingBytes, false);

  return buf;
}

describe('mp3XingFix — inspeção e reparo de cabeçalho Xing VBR', () => {
  it('detecta MP3 com Xing frames=0, bytes=0 como quebrado e repara com contagem exata', () => {
    const broken = buildSyntheticVbrMp3({ frameCount: 120, xingFrames: 0, xingBytes: 0 });
    expect(hasBrokenXingHeader(broken)).toBe(true);

    const before = inspectMp3Buffer(broken);
    expect(before.validMp3).toBe(true);
    expect(before.xingBroken).toBe(true);
    expect(before.actualFrames).toBe(120);
    expect(before.audioFrames).toBe(119);
    expect(before.streamBytes).toBe(120 * 192);

    const fixed = repairMp3XingHeader(broken);
    expect(fixed.repaired).toBe(true);
    expect(fixed.info.xingBroken).toBe(false);
    expect(fixed.info.xingFrames).toBe(119);
    expect(fixed.info.xingBytes).toBe(120 * 192);

    // Re-inspeção no buffer reparado confirma que está 100% íntegro
    expect(hasBrokenXingHeader(fixed.buffer)).toBe(false);
    const after = inspectMp3Buffer(fixed.buffer);
    expect(after.xingBroken).toBe(false);
    expect(after.xingFrames).toBe(119);
    expect(after.xingBytes).toBe(120 * 192);
  });

  it('não altera MP3 que já possui Xing válido', () => {
    const healthy = buildSyntheticVbrMp3({ frameCount: 60, xingFrames: 59, xingBytes: 60 * 192 });
    expect(hasBrokenXingHeader(healthy)).toBe(false);

    const res = repairMp3XingHeader(healthy);
    expect(res.repaired).toBe(false);
    expect(res.info.xingBroken).toBe(false);
  });

  it('rejeita HTML/lixo não-MP3 sem quebrar', () => {
    const html = new TextEncoder().encode('<html><body>404 Not Found</body></html>');
    expect(hasBrokenXingHeader(html)).toBe(false);
    const info = inspectMp3Buffer(html);
    expect(info.validMp3).toBe(false);
  });
});

