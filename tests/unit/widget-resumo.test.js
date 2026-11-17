import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.TZ = 'UTC'; // como na Cloudflare

let linhasPedidos = [];
let manual = null;
let tabela = {};          // metricas_diarias guardada: { dia: linha }
let tabelaQuebrada = false;
let consultasPedidos = 0;

vi.mock('../../src/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: (t) => {
      const q = {
        select: () => q, eq: () => q, is: () => q, gte: () => q, gt: () => q, lt: () => q, or: () => q, order: () => q, limit: () => q,
        in: () => q,
        maybeSingle: async () => ({ data: manual ? { valor: manual } : null, error: null }),
        upsert: async (rows) => { for (const r of rows) tabela[r.dia] = r; return { error: null }; },
        then: (res) => {
          if (t === 'orders') { consultasPedidos++; return res({ data: linhasPedidos, error: null }); }
          if (t === 'metricas_diarias') {
            if (tabelaQuebrada) return res({ data: null, error: { message: 'relation "metricas_diarias" does not exist' } });
            return res({ data: Object.values(tabela), error: null });
          }
          return res({ data: [], error: null });
        },
      };
      return q;
    },
  }),
}));
vi.mock('../../src/lib/adsSpend', () => ({
  getConsolidatedAdsSpend: async () => ({
    meta: { ok: true, byDate: { '2026-11-17': 40 }, byDateTaxable: { '2026-11-17': 10 }, total: 40 },
    tiktok: { ok: true, byDate: {}, total: 0 },
    google: { ok: true, byDate: {}, total: 0 },
  }),
}));

const { calcularResumoDia, aplicarGastosManuais, paraRelogioSp } = await import('../../src/lib/resumoDia.js');
const { linhaValida } = await import('../../src/lib/metricasDiarias.js');
const { calculateIntradayPace } = await import('../../src/lib/ritmoVendas.js');
const { mapearPedidoRelatorio } = await import('../../src/lib/pedidosRelatorio.js');
const { GET } = await import('../../src/app/api/widget/resumo/route.js');

// Linha do banco já no formato "leve" (extras em colunas x_*)
const linha = (criado, pago, extra = {}) => ({
  id: `${criado}-${Math.random()}`, created_at: criado, paid_at: pago, payment_status: pago ? 'PAGO' : 'AGUARDANDO_PAGAMENTO',
  suno_generation_count: 1, suno_provider: 'kie', production_status: 'AUDIO_GERADO', audio_url: 'a.mp3', x_paidAmount: 9.99, ...extra,
});
const AGORA = new Date('2026-11-17T15:00:00Z'); // 12:00 em Brasília

beforeEach(() => {
  linhasPedidos = []; manual = null; tabela = {}; tabelaQuebrada = false; consultasPedidos = 0;
  process.env.WIDGET_TOKEN = 'w'.repeat(40);
});

describe('resumo do dia (mesmas contas do Dashboard)', () => {
  it('lucro = faturamento − anúncios (com imposto Meta) − Kie − WhatsApp', async () => {
    linhasPedidos = [linha('2026-11-17T13:00:00Z', '2026-11-17T13:10:00Z'), linha('2026-11-17T14:00:00Z', '2026-11-17T14:20:00Z')];
    const r = await calcularResumoDia({}, AGORA);
    expect(r.dia).toBe('2026-11-17');
    expect(r.vendas).toBe(2);
    expect(r.faturamento).toBeGreaterThan(0);
    expect(r.despesas.anuncios).toBeCloseTo(40 + 10 * 0.138, 2);
    expect(r.despesas.kie).toBeCloseTo(0.6, 2);
    expect(r.lucro).toBeCloseTo(r.faturamento - r.despesas.anuncios - r.despesas.kie - r.despesas.whatsapp, 2);
  });

  it('venda às 23:30 de Brasília conta em hoje, não amanhã', async () => {
    linhasPedidos = [linha('2026-11-18T02:00:00Z', '2026-11-18T02:30:00Z')];
    const r = await calcularResumoDia({}, new Date('2026-11-18T02:45:00Z'));
    expect(r.dia).toBe('2026-11-17');
    expect(r.vendas).toBe(1);
  });

  it('ritmo pela tabela = ritmo do card do Dashboard (mesmos pedidos)', async () => {
    linhasPedidos = [];
    for (let d = 9; d <= 17; d++) {
      for (let h = 10; h < 22; h += 3) {
        const c = `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:05:00Z`;
        const p = (d + h) % 2 ? `2026-11-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:40:00Z` : null;
        linhasPedidos.push(linha(c, p, { x_paidAmount: 9.99 + (h % 3) }));
      }
    }
    const r = await calcularResumoDia({}, AGORA);
    const pedidosDashboard = paraRelogioSp(linhasPedidos.map((l) => {
      const extras = { paidAmount: l.x_paidAmount };
      return mapearPedidoRelatorio({ ...l, extras });
    }));
    const pace = calculateIntradayPace(pedidosDashboard, { daysLimit: 7, referenceDate: new Date(AGORA.getTime() - 3 * 3600 * 1000) });
    expect(r.ritmo.percentualVsMedia).toBe(Math.round(pace.revenueDiffPercent));
    expect(r.ritmo.projecaoFaturamento).toBeCloseTo(pace.projectedDayEndRevenue, 1);
    expect(r.ritmo.projecaoVendas).toBe(Math.round(pace.projectedDayEndPaid));
    expect(r.ritmo.diasNaMedia).toBe(pace.daysAveragedCount);
  });

  it('guarda na tabela: em 5 min não relê pedidos; dias fechados nunca mais', async () => {
    linhasPedidos = [linha('2026-11-17T13:00:00Z', '2026-11-17T13:10:00Z')];
    await calcularResumoDia({}, AGORA);
    expect(Object.keys(tabela)).toHaveLength(8); // hoje + 7 dias
    const primeira = consultasPedidos;
    expect(primeira).toBe(24); // 8 dias × 3 consultas (A, B, C)

    await calcularResumoDia({}, new Date(AGORA.getTime() + 4 * 60 * 1000));
    expect(consultasPedidos).toBe(primeira); // nada recalculado

    await calcularResumoDia({}, new Date(AGORA.getTime() + 6 * 60 * 1000));
    expect(consultasPedidos).toBe(primeira + 3); // só hoje
  });

  it('sem a tabela, calcula assim mesmo', async () => {
    tabelaQuebrada = true;
    linhasPedidos = [linha('2026-11-17T13:00:00Z', '2026-11-17T13:10:00Z')];
    const r = await calcularResumoDia({}, AGORA);
    expect(r.vendas).toBe(1);
  });

  it('validade: hoje 5 min; dia aberto 1 h; fechado (2 dias depois) para sempre', () => {
    const hoje = '2026-11-17';
    expect(linhaValida({ dia: hoje, calculado_em: '2026-11-17T14:57:00Z', detalhes: { v: 1 } }, hoje, AGORA)).toBe(true);
    expect(linhaValida({ dia: hoje, calculado_em: '2026-11-17T14:50:00Z', detalhes: { v: 1 } }, hoje, AGORA)).toBe(false);
    expect(linhaValida({ dia: '2026-11-16', calculado_em: '2026-11-17T14:30:00Z', detalhes: { v: 1 } }, hoje, AGORA)).toBe(true);
    expect(linhaValida({ dia: '2026-11-16', calculado_em: '2026-11-17T13:00:00Z', detalhes: { v: 1 } }, hoje, AGORA)).toBe(false);
    expect(linhaValida({ dia: '2026-11-10', calculado_em: '2026-11-12T04:00:00Z', detalhes: { v: 1 } }, hoje, AGORA)).toBe(true);
  });

  it('linha antiga sem os detalhes do Dashboard é recalculada', () => {
    expect(linhaValida({ dia: '2026-11-10', calculado_em: '2026-11-12T04:00:00Z' }, '2026-11-17', AGORA)).toBe(false);
  });

  it('gasto manual substitui o da API naquele dia', () => {
    const s = aplicarGastosManuais({ meta: { ok: true, byDate: { '2026-11-17': 40 }, total: 40 } }, { 'meta_2026-11-17': 25, 'tiktok_2026-11-17': 10, 'meta_2026-11-10': 99 }, '2026-11-17', '2026-11-17');
    expect(s.meta.total).toBe(25);
    expect(s.tiktok.total).toBe(10);
  });

  it('desloca só strings de data', () => {
    expect(paraRelogioSp({ a: '2026-11-17T03:00:00Z', b: 'texto', c: 5 })).toEqual({ a: '2026-11-17T00:00:00.000Z', b: 'texto', c: 5 });
  });
});

describe('/api/widget/resumo', () => {
  const req = (chave) => new Request('https://x.test/api/widget/resumo', { headers: chave ? { Authorization: `Bearer ${chave}` } : {} });
  it('recusa sem chave ou com chave errada', async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req('x'.repeat(40)))).status).toBe(401);
  });
  it('aceita a chave certa', async () => {
    const res = await GET(req('w'.repeat(40)));
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
  it('falha clara sem WIDGET_TOKEN no servidor', async () => {
    delete process.env.WIDGET_TOKEN;
    expect((await GET(req('w'.repeat(40)))).status).toBe(500);
  });
});

describe('busca do dia sem filtro no extras', () => {
  it('não usa campos do extras no filtro do banco', async () => {
    const { buscarPedidosQueTocaramODia } = await import('../../src/lib/metricasDiarias.js');
    const filtros = [];
    const supabase = {
      from: () => {
        const q = {
          select: () => q, order: () => q, limit: () => q, is: () => q,
          gte: (c) => { filtros.push(c); return q; }, gt: (c) => { filtros.push(c); return q; }, lt: (c) => { filtros.push(c); return q; },
          or: (f) => { filtros.push(f); return q; },
          then: (res) => res({ data: [{ id: 'x', created_at: '2026-11-17T12:00:00Z', payment_status: 'PAGO' }], error: null }),
        };
        return q;
      },
    };
    const r = await buscarPedidosQueTocaramODia(supabase, '2026-11-17');
    expect(r).toHaveLength(1); // deduplicado entre as 3 consultas
    expect(filtros.join(' ')).not.toMatch(/extras/);
  });
});
