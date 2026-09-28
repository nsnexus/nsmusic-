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
});
