import { describe, it, expect } from 'vitest';
import { buildSunoPayload } from '@/lib/sunoPayload';

// M-12 no AUDIT_REPORT.md: o botão "Tentar Novamente" montava o payload de um jeito diferente do
// ponto de geração inicial, perdendo musicMood e voiceType. Ambos os pontos agora usam esta função.

describe('buildSunoPayload', () => {
  it('usa lyrics como prompt quando disponível', () => {
    const payload = buildSunoPayload({ lyrics: 'Letra pronta', story: 'História bruta' });
    expect(payload.prompt).toBe('Letra pronta');
  });

  it('cai para story quando não há lyrics ainda', () => {
    const payload = buildSunoPayload({ lyrics: '', story: 'História bruta' });
    expect(payload.prompt).toBe('História bruta');
  });

  it('inclui musicStyle, musicMood e voiceType nas tags', () => {
    const payload = buildSunoPayload({
      lyrics: 'x',
      musicStyle: 'Sertanejo',
      musicMood: 'Alegre',
      voiceType: 'masculina',
    });
    expect(payload.tags).toBe('Sertanejo Alegre voice masculina');
  });

  it('usa "duet male and female vocalists" para voiceType dueto', () => {
    const payload = buildSunoPayload({
      lyrics: 'x',
      musicStyle: 'Pop',
      musicMood: 'Romântico',
      voiceType: 'dueto',
    });
    expect(payload.tags).toBe('Pop Romântico duet male and female vocalists');
  });

  it('não quebra com campos ausentes', () => {
    const payload = buildSunoPayload({});
    expect(payload.prompt).toBe('');
    expect(typeof payload.tags).toBe('string');
  });
});
