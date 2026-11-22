import { describe, it, expect } from 'vitest';
import { obterDuracaoAudioSegundos } from '../../src/lib/audioWav.js';

function wavPcmSegundos(segundos) {
  const sampleRate = 8000;
  const bytesPorSegundo = sampleRate * 2;
  const dataSize = segundos * bytesPorSegundo;
  const array = new Uint8Array(44 + dataSize);
  const view = new DataView(array.buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) array[offset + i] = text.charCodeAt(i);
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, bytesPorSegundo, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, dataSize, true);
  return new Blob([array], { type: 'audio/wav' });
}

describe('medição real da amostra de voz', () => {
  it('distingue uma gravação curta de uma com pelo menos 30 segundos', async () => {
    const curta = await obterDuracaoAudioSegundos(wavPcmSegundos(20));
    const valida = await obterDuracaoAudioSegundos(wavPcmSegundos(30));
    expect(curta).toBe(20);
    expect(curta).toBeLessThan(30);
    expect(valida).toBe(30);
    expect(valida).toBeGreaterThanOrEqual(30);
  });

  it('não inventa duração se nenhum áudio foi enviado', async () => {
    expect(await obterDuracaoAudioSegundos(null)).toBeNull();
  });
});
