import { describe, it, expect } from 'vitest';
import { normalizeBrazilPhoneDigits, formatarTelefoneBr, telefoneBrCompleto } from '../../src/lib/telefoneBr.js';

describe('telefoneBr', () => {
  it('remove o DDI 55 e a pontuação', () => {
    expect(normalizeBrazilPhoneDigits('+55 (31) 98241-4961')).toBe('31982414961');
    expect(normalizeBrazilPhoneDigits('55 21 3333-4444')).toBe('2133334444');
  });

  it('mantém o DDD 55 (Santa Maria) de celular', () => {
    expect(normalizeBrazilPhoneDigits('55991234567')).toBe('55991234567');
  });

  it('formata na mesma máscara do /criar', () => {
    expect(formatarTelefoneBr('31982414961')).toBe('(31) 98241-4961');
    expect(formatarTelefoneBr('5531982414961')).toBe('(31) 98241-4961');
    expect(formatarTelefoneBr('3182414961')).toBe('(31) 8241-4961');
    expect(formatarTelefoneBr('319')).toBe('(31) 9');
    expect(formatarTelefoneBr('')).toBe('');
  });

  it('só aceita DDD + 8 ou 9 dígitos', () => {
    expect(telefoneBrCompleto('(31) 98241-4961')).toBe(true);
    expect(telefoneBrCompleto('(31) 8241-4961')).toBe(true);
    expect(telefoneBrCompleto('(31) 9824')).toBe(false);
    expect(telefoneBrCompleto('')).toBe(false);
    expect(telefoneBrCompleto(null)).toBe(false);
  });
});
