import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { calcularQuadrosVideo, tentarVideoAcelerado } from '../../src/lib/videoRapido.js';
import { desenharQuadroSlideshow } from '../../src/lib/videoFrame.js';

const estado = vi.hoisted(() => ({
  videoSuportado: true,
  audioSuportado: true,
  duration: 420,
  frames: [],
  audios: [],
  cancelamentos: 0,
  falharNoFrame: -1,
}));

vi.mock('mediabunny', () => ({
  Quality: class Quality { constructor(opcoes) { this.opcoes = opcoes; } },
  Mp4OutputFormat: class Mp4OutputFormat { constructor(opcoes) { this.opcoes = opcoes; } },
  BufferTarget: class BufferTarget { constructor() { this.buffer = new Uint8Array(60 * 1024); } },
  CanvasSource: class CanvasSource {
    constructor() {}
    async add(timestamp) {
      if (estado.frames.length === estado.falharNoFrame) throw new Error('Falhou codificação H264');
      estado.frames.push(timestamp);
    }
    close() {}
  },
  AudioBufferSource: class AudioBufferSource {
    constructor() {}
    async add(buffer) { estado.audios.push(buffer.duration); }
    close() {}
  },
  Output: class Output {
    constructor({ target }) { this.target = target; this.state = 'pending'; }
    addVideoTrack() {}
    addAudioTrack() {}
    async start() { this.state = 'started'; }
    async finalize() { this.state = 'finalized'; }
    async cancel() { estado.cancelamentos++; this.state = 'canceled'; }
  },
  Input: class Input {
    constructor() {}
    async computeDuration() { return estado.duration; }
    async getPrimaryAudioTrack() { return {}; }
    async getPrimaryVideoTrack() { return {}; }
  },
  BlobSource: class BlobSource { constructor() {} },
  ALL_FORMATS: [],
  canEncodeVideo: async () => estado.videoSuportado,
  canEncodeAudio: async () => estado.audioSuportado,
}));

const oldWindow = globalThis.window;
const oldDocument = globalThis.document;
const contexto = () => ({
  fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), globalAlpha: 1,
});
const imagem = { naturalWidth: 1080, naturalHeight: 1920 };
const audio = { duration: 420, numberOfChannels: 2, sampleRate: 44100 };

beforeEach(() => {
  Object.assign(estado, {
    videoSuportado: true, audioSuportado: true, duration: 420,
    frames: [], audios: [], cancelamentos: 0, falharNoFrame: -1,
  });
  globalThis.window = { VideoEncoder: class {}, AudioEncoder: class {} };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto() }),
  };
});

afterEach(() => {
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
  if (oldDocument === undefined) delete globalThis.document;
  else globalThis.document = oldDocument;
});

describe('exportação acelerada de vídeo no front', () => {
  it('não corta vídeo ou áudio de 7 minutos no marco anterior de 360 segundos', async () => {
    const progresso = vi.fn();
    const blob = await tentarVideoAcelerado({
      imagens: [imagem, imagem, imagem], audioBuffer: audio, duracao: audio.duration,
      onProgress: progresso,
    });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');
    expect(estado.audios).toEqual([420]);
    expect(estado.frames).toHaveLength(6300);
    expect(estado.frames.at(-1)).toBeGreaterThan(419);
    expect(progresso).toHaveBeenCalledWith(95);
  });

  it('não tenta gerar com WebCodecs se o navegador não tiver codificação AAC', async () => {
    estado.audioSuportado = false;
    const blob = await tentarVideoAcelerado({
      imagens: [imagem], audioBuffer: audio, duracao: 420,
    });
    expect(blob).toBeNull();
    expect(estado.frames).toHaveLength(0);
  });

  it('cancela MP4 incompleto e permite o fallback do MediaRecorder', async () => {
    estado.falharNoFrame = 8;
    const blob = await tentarVideoAcelerado({
      imagens: [imagem], audioBuffer: audio, duracao: 420,
    });
    expect(blob).toBeNull();
    expect(estado.cancelamentos).toBe(1);
  });

  it('calcula quadros de durações longas e recusa durações inválidas', () => {
    expect(calcularQuadrosVideo(420)).toBe(6300);
    expect(calcularQuadrosVideo(360)).toBe(5400);
    expect(() => calcularQuadrosVideo(0)).toThrow();
  });

  it('preserva o mesmo enquadramento e fade em ambos os modos', () => {
    const ctx = contexto();
    desenharQuadroSlideshow(ctx, [imagem, imagem, imagem], 720, 1280, 420, 145);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    expect(ctx.fillRect).toHaveBeenCalledWith(0, 0, 720, 1280);
    expect(ctx.save).toHaveBeenCalledTimes(1);
    expect(ctx.restore).toHaveBeenCalledTimes(1);
  });
});
