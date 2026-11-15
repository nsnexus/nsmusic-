import { describe, it, expect } from 'vitest';
import { validarLetra } from '@/lib/letraValidacao';
import { sanitizarTags } from '@/lib/sunoTags';

const letraOk = '[Verso 1]\nMeu filho Eric, que alegria\n[Refrão]\nEric, meu amor\n[Refrão Final]\nEric';

describe('validarLetra', () => {
  it('aceita letra com o nome do homenageado (ignora acento e caixa)', () => {
    expect(validarLetra({ lyrics: letraOk, honoreeName: 'ÉRIC Silva' })).toEqual([]);
  });
  it('acusa quando só aparece o parentesco, sem o nome', () => {
    const p = validarLetra({ lyrics: '[Refrão]\nMeu filho querido\n[Verso 1]\nmeu filho', honoreeName: 'Eric' });
    expect(p.some((x) => x.includes('"Eric"'))).toBe(true);
  });
  it('confere nomes e frase obrigatórios', () => {
    const p = validarLetra({ lyrics: letraOk, honoreeName: 'Eric', requiredNames: 'Ana, Pedro', requiredPhrase: 'para sempre juntos' });
    expect(p.length).toBe(3);
  });
  it('acusa anotação de voz e falta de refrão', () => {
    const p = validarLetra({ lyrics: '[Verso 1]\n(Voz feminina) Eric', honoreeName: 'Eric' });
    expect(p.length).toBe(2);
  });
});

describe('sanitizarTags', () => {
  it('remove skank, quebras de linha e limita tamanho', () => {
    expect(sanitizarTags('reggae skank,\nwarm bass')).toBe('reggae, warm bass');
    expect(sanitizarTags('a, '.repeat(200)).length).toBeLessThanOrEqual(280);
  });
});
