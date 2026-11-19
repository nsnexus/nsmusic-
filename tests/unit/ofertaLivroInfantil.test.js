import { describe, it, expect } from 'vitest';
import { pedidoParaCrianca, deveMostrarOfertaLivro, primeiroNomeCrianca, LINK_CORUJA_LULU } from '../../src/lib/ofertaLivroInfantil.js';

describe('oferta da Coruja Lulu', () => {
  it.each(['Filho', 'Filha', 'Neto', 'Neta', 'Sobrinho', 'Sobrinha'])('%s é público do livro', (r) => {
    expect(pedidoParaCrianca({ relationship: r })).toBe(true);
    expect(pedidoParaCrianca({ recipientType: r })).toBe(true);
  });
  it.each(['Esposa', 'Mãe', 'Vó', 'Amigo', 'Eu mesmo', ''])('%s não é', (r) => {
    expect(pedidoParaCrianca({ relationship: r })).toBe(false);
  });
  it('estilo Infantil, Chá Revelação e "Outro" escrito à mão contam', () => {
    expect(pedidoParaCrianca({ relationship: 'Esposa', musicStyle: 'Infantil' })).toBe(true);
    expect(pedidoParaCrianca({ occasion: 'Chá Revelação' })).toBe(true);
    expect(pedidoParaCrianca({ relationship: 'Outro', customRelationship: 'minha afilhada' })).toBe(true);
    expect(pedidoParaCrianca({ relationship: 'Outro', customRelationship: 'meu chefe' })).toBe(false);
  });
  it('só aparece pago e uma vez', () => {
    const o = { relationship: 'Neta' };
    expect(deveMostrarOfertaLivro(o, { pago: true })).toBe(true);
    expect(deveMostrarOfertaLivro(o, { pago: false })).toBe(false);
    expect(deveMostrarOfertaLivro(o, { pago: true, jaVisto: true })).toBe(false);
  });
  it('primeiro nome e link com UTM', () => {
    expect(primeiroNomeCrianca({ honoreeName: 'Alice Maria' })).toBe('Alice');
    expect(LINK_CORUJA_LULU).toContain('utm_source=nsmusic');
  });
});
