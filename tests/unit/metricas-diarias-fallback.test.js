import { describe, it, expect, vi } from 'vitest';
import { obterMetricasDias } from '../../src/lib/metricasDiarias.js';

// Supabase mínimo: metricas_diarias devolve a linha guardada; orders falha (banco lento).
function supabaseFalso(guardadas) {
  const chainOrders = new Proxy({}, {
    get(_, prop) {
      if (prop === 'then') return (resolve) => resolve({ data: null, error: { message: 'statement timeout' } });
      return () => chainOrders;
    },
  });
  return {
    from(tabela) {
      if (tabela === 'metricas_diarias') {
        return {
          select: () => ({ in: async () => ({ data: guardadas, error: null }) }),
          upsert: vi.fn(async () => ({ error: null })),
        };
      }
      return chainOrders;
    },
  };
}

describe('obterMetricasDias — recálculo que falha', () => {
  const hoje = '2026-11-24';
  const agora = new Date('2026-11-24T14:00:00Z');

  it('usa a última linha guardada de hoje em vez de derrubar a rota', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const antiga = { dia: hoje, faturamento: 100, calculado_em: '2026-11-24T13:00:00Z', detalhes: { v: 0 } };
    const pendentes = [];
    const linhas = await obterMetricasDias(supabaseFalso([antiga]), [hoje], hoje, agora, { pendentes });
    expect(linhas[hoje].faturamento).toBe(100);
    expect(linhas[hoje].desatualizada).toBe(true);
    expect(pendentes).toEqual([hoje]);
  });

  it('sem nada guardado, continua propagando o erro', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(obterMetricasDias(supabaseFalso([]), [hoje], hoje, agora)).rejects.toThrow('statement timeout');
  });
});
