import { describe, expect, it, vi } from 'vitest';
import { obterEstadoQuadroSlideshow, desenharQuadroSlideshow } from '../../src/lib/slideshowFrames.js';
import { suportaVideoAcelerado } from '../../src/lib/videoFastRenderer.js';

describe('quadros do vídeo sem cortar a música', () => {
  it('chega até a última foto aos 7 minutos, sem encerrar aos 360s', () => {
    expect(obterEstadoQuadroSlideshow(0, 420, 10).indice).toBe(0);
    expect(obterEstadoQuadroSlideshow(359, 420, 10).indice).toBe(8);
    expect(obterEstadoQuadroSlideshow(419.9, 420, 10).indice).toBe(9);
    expect(obterEstadoQuadroSlideshow(420, 420, 10).indice).toBe(9);
  });

  it('preserva o zoom e o fade do slideshow original', () => {
    const inicio = obterEstadoQuadroSlideshow(0, 420, 10);
    expect(inicio.escala).toBe(1);
    expect(inicio.alpha).toBe(0);
    const meio = obterEstadoQuadroSlideshow(21, 420, 10);
    expect(meio.escala).toBeCloseTo(1.05);
    expect(meio.alpha).toBe(1);
    const segundaFoto = obterEstadoQuadroSlideshow(42, 420, 10);
    expect(segundaFoto.indice).toBe(1);
    expect(segundaFoto.alpha).toBe(0);
  });

  it('desenha a foto inteira sem deformar e restaura o contexto', () => {
    const ctx = {
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      globalAlpha: 1,
    };
    const fotos = [
      { naturalWidth: 1600, naturalHeight: 900 },
      { naturalWidth: 900, naturalHeight: 1600 },
    ];
    desenharQuadroSlideshow(ctx, fotos, 5, 10, 720, 1280);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const [, x, y, w, h] = ctx.drawImage.mock.calls[0];
    expect(w / h).toBeCloseTo(16 / 9);
    expect(x).toBeLessThanOrEqual(0);
    expect(y).toBeGreaterThan(0);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('recusa duração ou lista inválida', () => {
    expect(() => obterEstadoQuadroSlideshow(0, 0, 3)).toThrow();
    expect(() => obterEstadoQuadroSlideshow(0, 60, 0)).toThrow();
  });
});

describe('fallback do vídeo acelerado', () => {
  it('não exige WebCodecs no servidor ou em navegadores incompatíveis', async () => {
    const audio = { duration: 420, numberOfChannels: 2, sampleRate: 44100 };
    expect(await suportaVideoAcelerado(audio)).toBe(false);
  });
});
