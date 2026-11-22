import { describe, expect, it, vi } from 'vitest';
import {
  VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS, drawSlideshowFrame, getVideoFrameCount,
} from '../../src/lib/videoFrames.js';
import { renderFastSlideshow } from '../../src/lib/videoFast.js';

function makeCtx() {
  return {
    fillStyle: null,
    globalAlpha: 1,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
  };
}
const images = [
  { naturalWidth: 1600, naturalHeight: 900 },
  { naturalWidth: 900, naturalHeight: 1600 },
];

describe('renderização de vídeos longos no navegador', () => {
  it('não limita uma música de 7 minutos aos antigos 360 segundos', () => {
    expect(VIDEO_WIDTH).toBe(720);
    expect(VIDEO_HEIGHT).toBe(1280);
    expect(VIDEO_FPS).toBe(15);
    expect(getVideoFrameCount(420)).toBe(6300);
    expect(getVideoFrameCount(421)).toBe(6315);
    expect(getVideoFrameCount(0.01)).toBe(1);
  });

  it('mantém todas as imagens, inclusive nos segundos finais de 7 minutos', () => {
    const ctx = makeCtx();
    expect(drawSlideshowFrame(ctx, images, 0, 420)).toBe(0);
    expect(drawSlideshowFrame(ctx, images, 210, 420)).toBe(1);
    expect(drawSlideshowFrame(ctx, images, 419.9, 420)).toBe(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(3);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 720, 1280);
  });

  it('conserva transição fade-in e enquadramento vertical sem cortar a foto', () => {
    const ctx = makeCtx();
    const alphaSnapshots = [];
    ctx.drawImage.mockImplementation(() => alphaSnapshots.push(ctx.globalAlpha));
    drawSlideshowFrame(ctx, images, 0.25, 420);
    drawSlideshowFrame(ctx, images, 1.5, 420);
    expect(alphaSnapshots[0]).toBeCloseTo(0.5);
    expect(alphaSnapshots[1]).toBe(1);
    const [img, x, y, w, h] = ctx.drawImage.mock.calls[0];
    expect(img).toBe(images[0]);
    expect(w).toBeLessThanOrEqual(VIDEO_WIDTH * 1.1);
    expect(h).toBeLessThan(VIDEO_HEIGHT);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('recusa uma duração inválida, sem criar um arquivo truncado', () => {
    expect(() => getVideoFrameCount(0)).toThrow();
    expect(() => getVideoFrameCount(Number.NaN)).toThrow();
    expect(() => drawSlideshowFrame(makeCtx(), [], 0, 420)).toThrow();
  });

  it('preserva o fallback quando WebCodecs não está disponível no ambiente', async () => {
    // O runner Node não possui janela, VideoEncoder ou AudioEncoder.
    expect(await renderFastSlideshow({ images, audioBuffer: {}, duration: 420 })).toBeNull();
  });
});
