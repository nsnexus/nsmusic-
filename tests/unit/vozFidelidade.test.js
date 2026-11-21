import { describe, it, expect } from 'vitest';
import { fidelidadeDaConfig, camposFidelidadeParaSalvar, FIDELIDADE_VOZ_PADRAO, normalizarPeso } from '../../src/lib/vozFidelidade.js';
import { buildVoiceSongPayload } from '../../src/lib/kieVoice.js';

describe('fidelidade da voz clonada', () => {
  it('sem nada salvo usa o padrão', () => {
    expect(fidelidadeDaConfig({})).toEqual(FIDELIDADE_VOZ_PADRAO);
  });
  it('lê e limita os valores a 0–1 com 2 casas', () => {
    expect(fidelidadeDaConfig({ vozAudioWeight: 0.9, vozStyleWeight: 1.7, vozWeirdness: -1 })).toEqual({ audioWeight: 0.9, styleWeight: 1, weirdness: 0 });
    expect(normalizarPeso('0.456', 0.5)).toBe(0.46);
    expect(normalizarPeso('abc', 0.5)).toBe(0.5);
  });
  it('salva só o que veio do painel', () => {
    expect(camposFidelidadeParaSalvar({ vozAudioWeight: 0.95 })).toEqual({ vozAudioWeight: 0.95 });
    expect(camposFidelidadeParaSalvar({ whatsappSuporte: 'x' })).toEqual({});
  });
  it('o teste de voz do painel manda audio_weight para a Kie', () => {
    const p = buildVoiceSongPayload({ voiceId: 'v', prompt: 'letra' }, 'cb', { audioWeight: 0.9, styleWeight: 0.6, weirdness: 0.1 });
    expect(p.input).toMatchObject({ audio_weight: 0.9, style_weight: 0.6, weirdness_constraint: 0.1, persona_model: 'voice_persona' });
  });
});
