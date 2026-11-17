import { describe, it, expect } from 'vitest';
import { aplicarPatchNoPedido } from '../../src/lib/pedidoIrmao.js';

describe('aplicarPatchNoPedido', () => {
  const pedido = { id: 'principal', videoUrl: 'v-principal', relatedOrder: { id: 'bonus', videoUrl: '' } };

  it('vídeo da música bônus não mexe no vídeo da principal', () => {
    const r = aplicarPatchNoPedido(pedido, 'bonus', { videoUrl: 'v-bonus' });
    expect(r.videoUrl).toBe('v-principal');
    expect(r.relatedOrder.videoUrl).toBe('v-bonus');
  });

  it('vídeo da principal não mexe no da bônus', () => {
    const r = aplicarPatchNoPedido(pedido, 'principal', { videoUrl: 'novo' });
    expect(r.videoUrl).toBe('novo');
    expect(r.relatedOrder.videoUrl).toBe('');
  });

  it('sem pedido irmão, altera o próprio pedido', () => {
    expect(aplicarPatchNoPedido({ id: 'a' }, 'a', { x: 1 })).toEqual({ id: 'a', x: 1 });
    expect(aplicarPatchNoPedido(null, 'a', { x: 1 })).toBeNull();
  });
});
