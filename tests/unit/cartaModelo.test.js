import { describe, it, expect } from 'vitest';
import { cartaTemaId } from '@/lib/cartaModelo';

describe('cartaTemaId', () => {
  it('escolhe o tema automaticamente por ocasião/relação quando não há escolha do cliente', () => {
    expect(cartaTemaId({ occasion: 'Aniversário', relationship: 'Mãe' })).toBe('aniversario-feminino');
    expect(cartaTemaId({ occasion: 'Declaração de Amor' })).toBe('romantica');
  });

  it('respeita cartaTemaEscolhido (cliente trocou o tema, pedido 17/09/2026) sobre a escolha automática', () => {
    expect(cartaTemaId({ occasion: 'Aniversário', relationship: 'Mãe', cartaTemaEscolhido: 'romantica' })).toBe('romantica');
  });

  it('ignora cartaTemaEscolhido inválido/corrompido e cai na escolha automática', () => {
    expect(cartaTemaId({ occasion: 'Aniversário', relationship: 'Mãe', cartaTemaEscolhido: 'nao-existe' })).toBe('aniversario-feminino');
  });
});
