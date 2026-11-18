import { describe, it, expect } from 'vitest';
import { bonusDisponivel, camposDoBonus, pedidoJaGerou } from '../../src/lib/bonusAutomatico.js';

const pago = (extra = {}) => ({ id: 'pai1', orderNumber: 'NS-1001', paymentStatus: 'PAGAMENTO_APROVADO', ...extra });

describe('bonusDisponivel', () => {
  it('pedido pago sem bônus usado está disponível', () => {
    expect(bonusDisponivel(pago())).toBe(true);
    expect(bonusDisponivel(pago({ paymentStatus: 'PAGO' }))).toBe(true);
  });

  it('pedido não pago não tem bônus', () => {
    expect(bonusDisponivel(pago({ paymentStatus: 'AGUARDANDO_PAGAMENTO' }))).toBe(false);
  });

  it('bônus já usado não está disponível', () => {
    expect(bonusDisponivel(pago({ segundaGeracaoUsada: true }))).toBe(false);
    expect(bonusDisponivel(pago({ extras: { segundaGeracaoUsada: true } }))).toBe(false);
  });

  it('pedido que já é um bônus não dá outro bônus', () => {
    expect(bonusDisponivel(pago({ isSecondGeneration: true }))).toBe(false);
    expect(bonusDisponivel(pago({ paidSku: 'segunda_geracao_bonus' }))).toBe(false);
    expect(bonusDisponivel(pago({ parentOrderId: 'outro' }))).toBe(false);
  });

  it('bônus reservado por outro pedido que já gerou música fica ocupado', () => {
    const parent = pago({ segundaGeracaoOrderId: 'bonusA' });
    expect(bonusDisponivel(parent, { orderIdAtual: 'novo', pedidoVinculado: { id: 'bonusA', sunoTaskId: 't1' } })).toBe(false);
    expect(bonusDisponivel(parent, { orderIdAtual: 'novo', pedidoVinculado: { id: 'bonusA', audioUrl: 'https://x/a.mp3' } })).toBe(false);
  });

  it('bônus reservado por pedido abandonado (sem música) é liberado para o pedido novo', () => {
    const parent = pago({ segundaGeracaoOrderId: 'bonusA' });
    expect(bonusDisponivel(parent, { orderIdAtual: 'novo', pedidoVinculado: { id: 'bonusA' } })).toBe(true);
    expect(bonusDisponivel(parent, { orderIdAtual: 'novo', pedidoVinculado: null })).toBe(true);
  });

  it('o próprio pedido vinculado continua elegível (retentativa)', () => {
    const parent = pago({ segundaGeracaoOrderId: 'novo' });
    expect(bonusDisponivel(parent, { orderIdAtual: 'novo' })).toBe(true);
  });
});

describe('camposDoBonus', () => {
  it('marca o pedido como 2ª geração do pai e herda os add-ons', () => {
    const c = camposDoBonus(pago({ hasVideoAccess: true }));
    expect(c).toMatchObject({
      paymentStatus: 'PAGAMENTO_APROVADO',
      paidAmount: 0,
      paidSku: 'segunda_geracao_bonus',
      parentOrderId: 'pai1',
      isSecondGeneration: true,
      hasVideoAccess: true,
      bonusVinculadoPorTelefone: true,
    });
  });
});

describe('pedidoJaGerou', () => {
  it('pedido excluído não segura o bônus', () => {
    expect(pedidoJaGerou({ deletedAt: '2026-11-01', sunoTaskId: 't' })).toBe(false);
  });
});
