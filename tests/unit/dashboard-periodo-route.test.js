import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: true, tabela: {}, cacheDisponivel: true, leituras: [], consultasPedidos: 0 }));

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => state.admin ? { ok: true } : { ok: false, error: 'Acesso negado', status: 401 },
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from(tabela) {
      let datas = [];
      const query = {
        select: () => query,
        in(_coluna, valores) { datas = valores; return query; },
        gte: () => query, gt: () => query, lt: () => query, is: () => query, or: () => query,
        order: () => query, limit: () => query,
        upsert: async () => ({ error: null }),
        then(resolve) {
          if (tabela === 'orders') {
            state.consultasPedidos++;
            return resolve({ data: [], error: null });
          }
          state.leituras.push(datas);
          return resolve(state.cacheDisponivel
            ? { data: datas.map(dia => state.tabela[dia]).filter(Boolean), error: null }
            : { data: null, error: { message: 'Tabela indisponível no teste' } });
        },
      };
      return query;
    },
  }),
}));

const { GET } = await import('@/app/api/admin/dashboard-mes/route');

const url = (query = '') => new Request(`https://nsmusic.test/api/admin/dashboard-mes${query}`);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-12-01T03:01:00Z'));
  state.admin = true;
  state.cacheDisponivel = true;
  state.leituras = [];
  state.consultasPedidos = 0;
  state.tabela = Object.fromEntries(['2026-11-30', '2026-12-01'].map(dia => [
    dia, { dia, calculado_em: new Date().toISOString(), detalhes: { v: 1, feito: 12, convertido: 4, horas: [0, 4] } },
  ]));
});
afterEach(() => vi.useRealTimers());

describe('Período do dashboard', () => {
  it('abre somente hoje e aproveita a tabela de métricas para a série e o gráfico', async () => {
    const res = await GET(url());
    expect(await res.json()).toMatchObject({
      periodo: 'hoje', dia: '2026-12-01', dias: [1], serie: { feito: [12], convertido: [4] },
    });
    expect(state.leituras).toEqual([['2026-12-01']]);
    expect(state.consultasPedidos).toBe(0);
  });

  it('lê somente ontem no mês anterior quando hoje é dia 1 em Brasília', async () => {
    const res = await GET(url('?periodo=ontem'));
    expect(await res.json()).toMatchObject({ periodo: 'ontem', dia: '2026-11-30', mes: '2026-11', dias: [30] });
    expect(state.leituras).toEqual([['2026-11-30']]);
    expect(state.consultasPedidos).toBe(0);
  });

  it('recalcula somente hoje quando a tabela estiver indisponível', async () => {
    state.cacheDisponivel = false;
    const res = await GET(url('?periodo=hoje'));
    expect(await res.json()).toMatchObject({ periodo: 'hoje', dias: [1], incompleto: false });
    expect(state.leituras).toEqual([['2026-12-01']]);
    expect(state.consultasPedidos).toBe(3);
  });

  it('avança para as datas seguintes do mês mesmo sem conseguir guardar os resumos', async () => {
    state.cacheDisponivel = false;
    const primeira = await GET(url('?periodo=mes&mes=2026-11'));
    const inicial = await primeira.json();
    expect(inicial.dias).toEqual([25, 26, 27, 28, 29, 30]);
    expect(inicial.diasPendentes).toBe(24);
    const segunda = await GET(url(`?periodo=mes&mes=2026-11&dias=${inicial.pendentes.join(',')}`));
    expect(await segunda.json()).toMatchObject({ dias: [19, 20, 21, 22, 23, 24], diasPendentes: 18 });
    expect(state.leituras[1]).toEqual(inicial.pendentes);
  });

  it('continua exigindo acesso administrativo para ler as métricas', async () => {
    state.admin = false;
    const res = await GET(url('?periodo=hoje'));
    expect(res.status).toBe(401);
    expect(state.leituras).toEqual([]);
  });
});
