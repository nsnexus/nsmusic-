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

  // As tags deixaram de ser o rótulo cru em português ("Sertanejo Alegre voice masculina") e passaram
  // a descrever instrumentação/andamento em inglês, que é o que a Suno de fato interpreta bem
  // (reescrita de 03/09/2026 — o arranjo saía genérico com os rótulos soltos).
  it('traduz o estilo em instrumentação, não no rótulo cru da tela', () => {
    const payload = buildSunoPayload({
      lyrics: 'x',
      musicStyle: 'Sertanejo',
      musicMood: 'Alegre',
      voiceType: 'masculina',
    });
    expect(payload.tags).toContain('viola caipira');
    expect(payload.tags).toContain('uplifting');
    expect(payload.tags).toContain('male lead vocal');
    expect(payload.tags).not.toContain('Sertanejo');
  });

  it('descreve dueto com vozes alternadas para voiceType dueto', () => {
    const payload = buildSunoPayload({
      lyrics: 'x',
      musicStyle: 'Pop',
      musicMood: 'Romântica',
      voiceType: 'dueto',
    });
    expect(payload.tags).toContain('duet male and female vocalists');
    expect(payload.tags).toContain('alternating verses');
  });

  // Estilo digitado à mão (agente do WhatsApp aceita texto livre) não está no catálogo — precisa
  // passar adiante como veio, em vez de sumir e deixar a Suno sem nenhuma direção de estilo.
  it('preserva estilo fora do catálogo em vez de descartar', () => {
    const payload = buildSunoPayload({ lyrics: 'x', musicStyle: 'pisadinha do vaqueiro' });
    expect(payload.tags).toContain('pisadinha do vaqueiro');
  });

  it('não quebra com campos ausentes', () => {
    const payload = buildSunoPayload({});
    expect(payload.prompt).toBe('');
    expect(typeof payload.tags).toBe('string');
  });
});
