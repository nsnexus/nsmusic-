import { describe, it, expect } from 'vitest';
import { calculateIntradayPace } from '@/lib/ritmoVendas';

describe('calculateIntradayPace', () => {
  const refDate = new Date(2026, 8, 28, 16, 30, 0);

  it('calcula faturamento acumulado de hoje e média dos dias anteriores', () => {
    const dHoje10 = new Date(2026, 8, 28, 10, 15, 0).toISOString();
    const dHoje14 = new Date(2026, 8, 28, 14, 20, 0).toISOString();
    const dOntem10 = new Date(2026, 8, 27, 10, 0, 0).toISOString();
    const dOntem18 = new Date(2026, 8, 27, 18, 0, 0).toISOString();

    const pedidos = [
      // Pedido de HOJE às 10h (R$ 9.99)
      {
        id: 'hoje-1',
        paymentStatus: 'PAGO',
        paidAt: dHoje10,
        createdAt: dHoje10,
      },
      // Pedido de HOJE às 14h (R$ 9.99 música + R$ 6.90 vídeo)
      {
        id: 'hoje-2',
        paymentStatus: 'PAGO',
        paidAt: dHoje14,
        hasVideoAccess: true,
        videoPaidAt: dHoje14,
        createdAt: dHoje14,
      },
      // Pedido de ONTEM às 10h (R$ 9.99)
      {
        id: 'ontem-1',
        paymentStatus: 'PAGO',
        paidAt: dOntem10,
        createdAt: dOntem10,
      },
      // Pedido de ONTEM às 18h (R$ 9.99)
      {
        id: 'ontem-2',
        paymentStatus: 'PAGO',
        paidAt: dOntem18,
        createdAt: dOntem18,
      },
    ];

    const result = calculateIntradayPace(pedidos, { referenceDate: refDate });

    expect(result.currentHour).toBe(refDate.getHours());
    expect(result.todayRevenueSoFar).toBeGreaterThan(26); // 9.99 + 9.99 + 6.90 = ~26.88
    expect(result.todayCumulativeRevenue[10]).toBeCloseTo(9.99, 1);
    expect(result.todayCumulativeRevenue[14]).toBeCloseTo(26.88, 1);

    // Média de ontem
    expect(result.avgCumulativeRevenue[10]).toBeCloseTo(9.99, 1);
    expect(result.avgCumulativeRevenue[23]).toBeCloseTo(19.98, 1);

    // Projeção para o fim do dia
    expect(result.projectedDayEndRevenue).toBeGreaterThan(0);
    expect(result.daysAveragedCount).toBe(1);
  });

  it('lida graciosamente com lista vazia de pedidos', () => {
    const result = calculateIntradayPace([], { referenceDate: refDate });

    expect(result.todayRevenueSoFar).toBe(0);
    expect(result.avgRevenueAtCurrentHour).toBe(0);
    expect(result.projectedDayEndRevenue).toBe(0);
    expect(result.daysAveragedCount).toBe(0);
  });

  it('inclui apenas os últimos 7 dias na média, ignorando dias mais antigos', () => {
    const hoje = new Date(2026, 8, 28, 12, 0, 0); // 28/09
    const pedidos = [];

    // Pedido de hoje (R$ 9.99)
    pedidos.push({
      id: 'hoje',
      paymentStatus: 'PAGO',
      paidAt: hoje.toISOString(),
      createdAt: hoje.toISOString(),
    });

    // 7 dias anteriores (21/09 a 27/09): 1 pedido de R$ 10 em cada um
    for (let i = 1; i <= 7; i++) {
      const d = new Date(hoje);
      d.setDate(d.getDate() - i);
      d.setHours(10, 0, 0, 0);
      pedidos.push({
        id: `dia-${i}`,
        paymentStatus: 'PAGO',
        paidAt: d.toISOString(),
        createdAt: d.toISOString(),
      });
    }

    // Pedido de 10 dias atrás (18/09) - deve ser ignorado
    const dAntigo = new Date(hoje);
    dAntigo.setDate(dAntigo.getDate() - 10);
    pedidos.push({
      id: 'antigo-10d',
      paymentStatus: 'PAGO',
      paidAt: dAntigo.toISOString(),
      createdAt: dAntigo.toISOString(),
    });

    const result = calculateIntradayPace(pedidos, { referenceDate: hoje, daysLimit: 7 });

    expect(result.daysAveragedCount).toBe(7);
    expect(result.daysLimit).toBe(7);
    // Cada um dos 7 dias teve 1 pedido de R$ 9.99 às 10h -> média às 12h deve ser 9.99
    expect(result.avgRevenueAtCurrentHour).toBeCloseTo(9.99, 1);
  });

  it('calcula média dos últimos 7 dias na virada do mês (ex: 01 de outubro)', () => {
    const primeiroDeOutubro = new Date(2026, 9, 1, 11, 30, 0); // 01/10/2026 11:30
    const pedidos = [];

    // Pedido de hoje (01/10 às 10h)
    pedidos.push({
      id: 'outubro-01',
      paymentStatus: 'PAGO',
      paidAt: new Date(2026, 9, 1, 10, 0, 0).toISOString(),
      createdAt: new Date(2026, 9, 1, 10, 0, 0).toISOString(),
    });

    // Pedidos nos últimos dias de setembro (30/09, 29/09, 28/09)
    for (let i = 1; i <= 3; i++) {
      const d = new Date(primeiroDeOutubro);
      d.setDate(d.getDate() - i); // dias de setembro
      d.setHours(9, 0, 0, 0);
      pedidos.push({
        id: `setembro-${i}`,
        paymentStatus: 'PAGO',
        paidAt: d.toISOString(),
        createdAt: d.toISOString(),
      });
    }

    const result = calculateIntradayPace(pedidos, { referenceDate: primeiroDeOutubro, daysLimit: 7 });

    expect(result.daysAveragedCount).toBe(3);
    expect(result.todayRevenueSoFar).toBeCloseTo(9.99, 1);
    expect(result.avgRevenueAtCurrentHour).toBeCloseTo(9.99, 1);
    expect(result.avgCumulativeRevenue[9]).toBeCloseTo(9.99, 1);
  });

  it('respeita o valor liquido real de combos (paidAmount) em vez de somar SKUs avulsos', () => {
    const hoje = new Date(2026, 9, 8, 14, 0, 0);
    const pedidos = [
      {
        id: 'combo-1689',
        paymentStatus: 'PAGO',
        paidAmount: 16.89,
        hasVideoAccess: true,
        hasCartaAccess: true,
        paidAt: new Date(2026, 9, 8, 11, 0, 0).toISOString(),
        createdAt: new Date(2026, 9, 8, 11, 0, 0).toISOString(),
      }
    ];

    const result = calculateIntradayPace(pedidos, { referenceDate: hoje, daysLimit: 7 });
    expect(result.todayRevenueSoFar).toBeCloseTo(16.89, 2);
  });
});
