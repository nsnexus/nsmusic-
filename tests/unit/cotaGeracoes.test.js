import { describe, it, expect } from 'vitest';
import { calcularCota, pedidoFoiPago, COTA_INICIAL, COTA_POR_COMPRA } from '@/lib/cotaGeracoes';

// A geração é o que custa dinheiro no estúdio, e ela acontece ANTES de qualquer pagamento. Até
// 25/09/2026 a regra era "quem pagou uma vez gera sem limite": um pagamento de R$ 9,99 liberava
// infinitas músicas. Agora cada compra vale uma cota, e estes testes fixam a conta.

const pedido = (status) => ({ paymentStatus: status });
const pedidos = (n, status) => Array.from({ length: n }, () => pedido(status));

describe('cota de gerações', () => {
  it('quem nunca gerou nada tem a cota inicial inteira', () => {
    expect(calcularCota([])).toMatchObject({ cota: COTA_INICIAL, usados: 0, restantes: COTA_INICIAL, bloqueado: false });
  });

  it('bloqueia ao esgotar a cota inicial sem nenhuma compra', () => {
    const r = calcularCota(pedidos(COTA_INICIAL, 'AGUARDANDO_PAGAMENTO'));
    expect(r.bloqueado).toBe(true);
    expect(r.restantes).toBe(0);
  });

  it('uma compra soma COTA_POR_COMPRA e destrava de novo', () => {
    const lista = [...pedidos(4, 'AGUARDANDO_PAGAMENTO'), pedido('PAGAMENTO_APROVADO')];
    const r = calcularCota(lista);
    expect(r.pagos).toBe(1);
    expect(r.cota).toBe(COTA_INICIAL + COTA_POR_COMPRA);
    expect(r.usados).toBe(5);
    expect(r.bloqueado).toBe(false);
  });

  it('duas compras somam duas cotas', () => {
    const lista = [...pedidos(2, 'PAGO'), ...pedidos(8, 'AGUARDANDO_PAGAMENTO')];
    expect(calcularCota(lista).cota).toBe(COTA_INICIAL + 2 * COTA_POR_COMPRA);
  });

  // O ponto da mudança: pagar uma vez não é passe livre para sempre.
  it('quem pagou uma vez volta a ser bloqueado ao esgotar a cota ampliada', () => {
    const lista = [pedido('PAGO'), ...pedidos(9, 'AGUARDANDO_PAGAMENTO')];
    const r = calcularCota(lista);
    expect(r.cota).toBe(10);
    expect(r.usados).toBe(10);
    expect(r.bloqueado).toBe(true);
  });

  it('aceita os três status de pago que existem na base', () => {
    for (const status of ['PAGO', 'PAGAMENTO_APROVADO', 'approved']) {
      expect(pedidoFoiPago(pedido(status))).toBe(true);
    }
    expect(pedidoFoiPago(pedido('AGUARDANDO_PAGAMENTO'))).toBe(false);
    expect(pedidoFoiPago(undefined)).toBe(false);
  });

  it('entrada inválida não libera nem bloqueia por engano', () => {
    expect(calcularCota(null)).toMatchObject({ usados: 0, bloqueado: false });
  });
});
