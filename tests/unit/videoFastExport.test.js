import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  frames: 0,
  lastTimestamp: 0,
  lastFrameDuration: 0,
  audioWrites: 0,
  finalized: false,
}));

vi.mock('mediabunny', () => {
  class Output {
    constructor({ target }) { this.target = target; }
    addVideoTrack() {}
    addAudioTrack() {}
    async start() {}
    async finalize() { state.finalized = true; }
    async cancel() {}
  }
  class CanvasSource {
    async add(timestamp, duration) {
      state.frames += 1;
      state.lastTimestamp = timestamp;
      state.lastFrameDuration = duration;
    }
  }
  class AudioBufferSource {
    async add() { state.audioWrites += 1; }
  }
  class Input {
    async getPrimaryVideoTrack() { return { kind: 'video' }; }
    async getPrimaryAudioTrack() { return { kind: 'audio' }; }
    async computeDuration() { return 420; }
    dispose() {}
  }
  return {
    Output,
    CanvasSource,
    AudioBufferSource,
    Quality: class Quality { constructor() {} },
    Mp4OutputFormat: class Mp4OutputFormat { constructor() {} },
    BufferTarget: class BufferTarget {
      constructor() { this.buffer = new ArrayBuffer(2_200_000); }
    },
    Input,
    BlobSource: class BlobSource { constructor() {} },
    ALL_FORMATS: [],
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
  };
});

const { renderizarSlideshowAcelerado } = await import('../../src/lib/videoFastRenderer.js');

describe('renderizador WebCodecs do vídeo no front', () => {
  it('escreve os 6300 quadros de uma música de 7 minutos e mantém o áudio', async () => {
    state.frames = 0;
    state.audioWrites = 0;
    state.finalized = false;

    const canvas = { width: 720, height: 1280 };
    const ctx = {
      fillStyle: '#000',
      globalAlpha: 1,
      fillRect() {},
      drawImage() {},
      save() {},
      restore() {},
    };
    const imagens = Array.from({ length: 10 }, () => ({ naturalWidth: 1280, naturalHeight: 720 }));
    const pcm = new Float32Array(4096);
    pcm[0] = 0.5;
    const audioBuffer = {
      duration: 420,
      numberOfChannels: 1,
      sampleRate: 44100,
      getChannelData: () => pcm,
    };
    const updates = [];
    const blob = await renderizarSlideshowAcelerado({
      canvas,
      ctx,
      imagens,
      audioBuffer,
      onProgress: (percent) => updates.push(percent),
    });

    expect(blob.type).toBe('video/mp4');
    expect(blob.size).toBe(2_200_000);
    expect(state.frames).toBe(420 * 15);
    expect(state.lastTimestamp).toBeCloseTo(420 - 1 / 15);
    expect(state.lastTimestamp + state.lastFrameDuration).toBeCloseTo(420);
    expect(state.audioWrites).toBe(1);
    expect(state.finalized).toBe(true);
    expect(updates.at(-1)).toBeLessThanOrEqual(95);
  });
});
