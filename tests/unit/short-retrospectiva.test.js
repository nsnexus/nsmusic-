import { describe, it, expect } from 'vitest';
import { buildRetrospectivaMetadata } from '@/lib/retrospectivaMetadata';

describe('buildRetrospectivaMetadata - metadados Open Graph para retrospectiva', () => {
  it('gera metadados personalizados com título da retrospectiva, fotos e nomes', () => {
    const order = {
      id: 'order-retro-1',
      honoreeName: 'Camila',
      customerName: 'Lucas',
      coverUrl: 'https://cdn.example.com/musica.jpg',
      retrospectiva: {
        titulo: 'Nossos 5 anos juntos',
        fotos: ['https://cdn.example.com/foto-casal-1.jpg', 'https://cdn.example.com/foto-casal-2.jpg'],
      },
    };

    const meta = buildRetrospectivaMetadata('order-retro-1', order);

    expect(meta.title).toBe('📖 Nossos 5 anos juntos | Retrospectiva de Camila');
    expect(meta.description).toContain('Lucas');
    expect(meta.description).toContain('Camila');
    expect(meta.openGraph.title).toBe('📖 Nossos 5 anos juntos | Retrospectiva de Camila');
    expect(meta.openGraph.images[0].url).toBe('https://cdn.example.com/foto-casal-1.jpg');
    expect(meta.twitter.images[0]).toBe('https://cdn.example.com/foto-casal-1.jpg');
    expect(meta.openGraph.url).toContain('/r/order-retro-1');
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it('faz fallback gracioso quando o pedido não tem fotos ou título', () => {
    const meta = buildRetrospectivaMetadata('order-sem-dados', null);

    expect(meta.title).toBe('📖 Uma Retrospectiva Especial para Você');
    expect(meta.openGraph.images[0].url).toContain('og-homenagem.jpg');
    expect(meta.openGraph.url).toContain('/r/order-sem-dados');
  });

  it('prioriza fotos da retrospectiva antes da capa da música', () => {
    const order = {
      id: 'order-prioridade',
      honoreeName: 'Beatriz',
      coverUrl: 'https://cdn.example.com/capa.jpg',
      retrospectiva: {
        fotos: ['https://cdn.example.com/foto-retro.jpg'],
      },
    };

    const meta = buildRetrospectivaMetadata('order-prioridade', order);
    expect(meta.openGraph.images[0].url).toBe('https://cdn.example.com/foto-retro.jpg');
  });
});
