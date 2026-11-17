import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.TZ = 'UTC'; // como na Cloudflare

let pedidosMes = [];
let pedidosRecentes = [];
let manual = null;
vi.mock('../../src/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: manual ? { valor: manual } : null, error: null }) };
      return q;
    },
  }),
}));
vi.mock('../../src/lib/pedidosRelatorio', () => ({
  buscarPedidosDoPeriodo: async () => pedidosMes,
  buscarPedidosRecentes: async () => pedidosRecentes,
}));
vi.mock('../../src/lib/adsSpend', () => ({
  getConsolidatedAdsSpend: async () => ({
    meta: { ok: true, byDate: { '2026-11-17': 40 }, byDateTaxable: { '2026-11-17': 10 }, total: 40 },
    tiktok: { ok: true, byDate: {}, total: 0 },
    google: { ok: true, byDate: {}, total: 0 },
  }),
}));

const { calcularResumoDia, aplicarGastosManuais, paraRelogioSp } = await import('../../src/lib/resumoDia.js');
const { GET } = await import('../../src/app/api/widget/resumo/route.js');

const pago = (criado, pago, extra = {}) => ({ id: criado, paymentStatus: 'PAGO', createdAt: criado, paidAt: pago, paidAmount: 9.99, sunoGenerationCount: 1, sunoProvider: 'kie', productionStatus: 'AUDIO_GERADO', ...extra });

beforeEach(() => {
  pedidosMes = []; pedidosRecentes = []; manual = null;
  process.env.WIDGET_TOKEN = 'w'.repeat(40);
});

describe('resumo do dia (mesmas contas do Dashboard)', () => {
  it('lucro = faturamento − anúncios (com imposto Meta) − Kie − WhatsApp', async () => {
    pedidosMes = [pago('2026-11-17T13:00:00Z', '2026-11-17T13:10:00Z'), pago('2026-11-17T14:00:00Z', '2026-11-17T14:20:00Z')];
    const r = await calcularResumoDia({}, new Date('2026-11-17T15:00:00Z'));
    expect(r.dia).toBe('2026-11-17');
    expect(r.vendas).toBe(2);
    expect(r.faturamento).toBeGreaterThan(0);
    expect(r.despesas.anuncios).toBeCloseTo(40 + 10 * 0.138, 2);
    expect(r.despesas.kie).toBeCloseTo(0.6, 2);
    expect(r.lucro).toBeCloseTo(r.faturamento - r.despesas.anuncios - r.despesas.kie - r.despesas.whatsapp, 2);
  });

  it('venda às 23:30 de Brasília conta em hoje, não amanhã', async () => {
    pedidosMes = [pago('2026-11-18T02:00:00Z', '2026-11-18T02:30:00Z')]; // 17/11 23:00 e 23:30 em Brasília
    const r = await calcularResumoDia({}, new Date('2026-11-18T02:45:00Z'));
    expect(r.dia).toBe('2026-11-17');
    expect(r.vendas).toBe(1);
  });

  it('venda de ontem à noite não entra em hoje', async () => {
    pedidosMes = [pago('2026-11-17T02:00:00Z', '2026-11-17T02:30:00Z')]; // 16/11 23:30 em Brasília
    const r = await calcularResumoDia({}, new Date('2026-11-17T15:00:00Z'));
    expect(r.vendas).toBe(0);
  });

  it('ritmo devolve projeção do dia', async () => {
    pedidosRecentes = [pago('2026-11-17T13:00:00Z', '2026-11-17T13:10:00Z'), pago('2026-11-16T13:00:00Z', '2026-11-16T13:10:00Z')];
    const r = await calcularResumoDia({}, new Date('2026-11-17T15:00:00Z'));
    expect(typeof r.ritmo.percentualVsMedia).toBe('number');
    expect(r.ritmo.projecaoFaturamento).toBeGreaterThanOrEqual(0);
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
