import { describe, it, expect } from 'vitest';
import { buildHomenagemMetadata } from '@/lib/homenagemMetadata';

describe('buildHomenagemMetadata - metadados Open Graph para homenagem', () => {
  it('gera metadados personalizados com nome do homenageado e capa da música', () => {
    const order = {
      id: 'order-xyz',
      honoreeName: 'Déborah',
      customerName: 'Rodrigo',
      coverUrl: 'https://cdn.example.com/capa-deborah.jpg',
    };

    const meta = buildHomenagemMetadata('order-xyz', order);

    expect(meta.title).toBe('🎁 Uma Homenagem Especial para Déborah');
    expect(meta.description).toContain('Rodrigo');
    expect(meta.description).toContain('Déborah');
    expect(meta.openGraph.title).toBe('🎁 Uma Homenagem Especial para Déborah');
    expect(meta.openGraph.images[0].url).toBe('https://cdn.example.com/capa-deborah.jpg');
    expect(meta.twitter.images[0]).toBe('https://cdn.example.com/capa-deborah.jpg');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('faz fallback gracioso quando o pedido não tem capa ou não é encontrado', () => {
    const meta = buildHomenagemMetadata('order-nao-existe', null);

    expect(meta.title).toBe('🎁 Uma Homenagem Especial para Você');
    expect(meta.openGraph.images[0].url).toContain('og-homenagem.jpg');
    expect(meta.openGraph.url).toContain('/h/order-nao-existe');
  });
});
