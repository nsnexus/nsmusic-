import { describe, it, expect } from 'vitest';
import { buildCartaMetadata } from '@/lib/cartaMetadata';

describe('buildCartaMetadata - metadados Open Graph para carta virtual', () => {
  it('gera título "Carta Especial de [Remetente]" quando remetente está disponível', () => {
    const order = {
      id: 'order-carta-1',
      customerName: 'Rodrigo',
      honoreeName: 'Déborah',
    };

    const meta = buildCartaMetadata('order-carta-1', order);

    expect(meta.title).toBe('💌 Carta Especial de Rodrigo para Déborah');
    expect(meta.description).toContain('Rodrigo');
    expect(meta.description).toContain('Déborah');
    expect(meta.openGraph.title).toBe('💌 Carta Especial de Rodrigo para Déborah');
    expect(meta.openGraph.url).toContain('/c/order-carta-1');
  });

  it('gera título "Carta Especial de [Remetente]" mesmo sem honoree', () => {
    const order = {
      id: 'order-carta-2',
      customerName: 'Lucas',
    };

    const meta = buildCartaMetadata('order-carta-2', order);

    expect(meta.title).toBe('💌 Carta Especial de Lucas');
    expect(meta.description).toContain('Lucas');
  });

  it('faz fallback gracioso quando o pedido não tem remetente nem dados', () => {
    const meta = buildCartaMetadata('order-sem-dados', null);

    expect(meta.title).toBe('💌 Você recebeu uma Carta Especial...');
    expect(meta.openGraph.images[0].url).toContain('og-carta.jpg');
    expect(meta.openGraph.url).toContain('/c/order-sem-dados');
  });
});
