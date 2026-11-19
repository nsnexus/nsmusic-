import { describe, it, expect } from 'vitest';
import { totalGeracoesExtras, pedidosQueUsaram, saldoGeracoesExtras, pedidoEhGeracaoExtra } from '../../src/lib/geracoesExtrasRegras.js';

describe('gerações extras do Pacote Família', () => {
  const pacote = (extra = {}) => ({ id: 'F1', paymentStatus: 'PAGAMENTO_APROVADO', extras: { geracoesExtras: 5, geracoesExtrasPedidos: [] }, ...extra });

  it('lê total e lista no topo ou em extras', () => {
    expect(totalGeracoesExtras(pacote())).toBe(5);
    expect(totalGeracoesExtras({ geracoesExtras: 5 })).toBe(5);
    expect(totalGeracoesExtras({ id: 'x' })).toBe(0);
    expect(pedidosQueUsaram({ extras: { geracoesExtrasPedidos: ['a', null, 'b'] } })).toEqual(['a', 'b']);
  });

  it('saldo desconta só pedidos que existem e geraram música', () => {
    const p = pacote({ extras: { geracoesExtras: 5, geracoesExtrasPedidos: ['a', 'b', 'c'] } });
    expect(saldoGeracoesExtras(p)).toBe(2);
    const carregados = [
      { id: 'a', audioFiles: ['x'] },
      { id: 'b', sunoTaskId: 't' },
      { id: 'c' }, // abandonado antes de gerar: devolve a geração
    ];
    expect(saldoGeracoesExtras(p, carregados)).toBe(3);
    expect(saldoGeracoesExtras(p, [{ id: 'a', audioFiles: ['x'], deletedAt: '2026-11-19' }])).toBe(5);
  });

  it('nunca fica negativo e pedido comum não tem saldo', () => {
    expect(saldoGeracoesExtras({ geracoesExtras: 1, geracoesExtrasPedidos: ['a', 'b'] })).toBe(0);
    expect(saldoGeracoesExtras({ id: 'comum' })).toBe(0);
  });

  it('reconhece o pedido que é uma geração extra', () => {
    expect(pedidoEhGeracaoExtra({ familiaOrderId: 'F1' })).toBe(true);
    expect(pedidoEhGeracaoExtra({ extras: { familiaOrderId: 'F1' } })).toBe(true);
    expect(pedidoEhGeracaoExtra({ paidSku: 'geracao_extra_familia' })).toBe(true);
    expect(pedidoEhGeracaoExtra({ paidSku: 'combo' })).toBe(false);
  });
});
