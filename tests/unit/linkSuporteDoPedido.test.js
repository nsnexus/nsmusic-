import { describe, it, expect } from 'vitest';
import { linkSuporteDoPedido, orderIdDoLink } from '@/lib/whatsappCloudApi';

// Mensagens oficiais (prévia pronta, pagamento confirmado, recuperação) apontam o suporte para o
// chat do site já no pedido, em vez do wa.me.

describe('linkSuporteDoPedido', () => {
  it('leva o id do pedido para o chat', () => {
    expect(linkSuporteDoPedido('abcdefghijklmnopqrst')).toBe('https://nsmusic.ia.br/suporte?pedido=abcdefghijklmnopqrst');
  });

  it('número NS- ou vazio vai sem pedido (o chat pede o WhatsApp)', () => {
    expect(linkSuporteDoPedido('NS-2026-1234-AB')).toBe('https://nsmusic.ia.br/suporte');
    expect(linkSuporteDoPedido('')).toBe('https://nsmusic.ia.br/suporte');
  });
});

describe('orderIdDoLink', () => {
  it('tira o pedido do link de entrega', () => {
    expect(orderIdDoLink('https://nsmusic.ia.br/entrega?orderId=abc123XYZ&x=1')).toBe('abc123XYZ');
    expect(orderIdDoLink('https://nsmusic.ia.br/')).toBe('');
  });
});
