import { describe, it, expect } from 'vitest';
import { variantesTelefoneVoz } from '../../src/lib/customerVoices.js';

describe('variantesTelefoneVoz (voz achada com ou sem o nono dígito)', () => {
  it('celular com 9: inclui a grafia antiga sem o 9', () => {
    expect(variantesTelefoneVoz('(48) 99664-7803')).toEqual(['5548996647803', '554896647803']);
  });
  it('celular sem o 9 (como foi vinculado no painel): inclui a grafia com 9', () => {
    expect(variantesTelefoneVoz('554896647803')).toEqual(['554896647803', '5548996647803']);
  });
  it('fixo (começa com 2 a 5) não ganha 9', () => {
    expect(variantesTelefoneVoz('551133334444')).toEqual(['551133334444']);
  });
  it('vazio', () => {
    expect(variantesTelefoneVoz('')).toEqual([]);
  });
});
