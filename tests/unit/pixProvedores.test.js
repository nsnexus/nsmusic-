import { describe, it, expect } from 'vitest';
import { contarProvedoresPix } from '../../src/lib/pixProvedores.js';
import { montarAvisoPixEstatico } from '../../src/lib/avisoPixEstatico.js';

describe('contarProvedoresPix', () => {
  it('separa hoje e semana por degrau', () => {
    const r = contarProvedoresPix([
      { provider: 'efi', created_at: '2026-11-24T05:00:00Z' },
      { provider: 'static', created_at: '2026-11-24T06:00:00Z' },
      { provider: 'infinitepay', created_at: '2026-11-22T12:00:00Z' },
      { provider: null, created_at: '2026-11-21T12:00:00Z' },
    ], '2026-11-24T03:00:00.000Z');
    expect(r.hoje).toEqual({ efi: 1, infinitepay: 0, static: 1, total: 2 });
    expect(r.semana).toEqual({ efi: 2, infinitepay: 1, static: 1, total: 4 });
  });
});

describe('montarAvisoPixEstatico', () => {
  it('traz pedido, cliente, pacote e link do painel', () => {
    const t = montarAvisoPixEstatico({ id: 'abc', orderNumber: 'NS-1', customerName: 'Ana', customerPhone: '(11) 9' }, { sku: 'combo', valor: 16.9 });
    expect(t).toContain('NS-1');
    expect(t).toContain('Ana');
    expect(t).toContain('R$ 16,90');
    expect(t).toContain('/admin/pedidos/abc');
  });
});
