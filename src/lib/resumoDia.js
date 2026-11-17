// Resumo do dia para o widget da tela inicial (app Android "NS Music Widget"), com as mesmas
// contas do Dashboard (ver calcularResumoDia). Tudo no fuso de Brasília.
import { getSupabaseEdge } from './supabase-edge';
import { getConsolidatedAdsSpend } from './adsSpend';
import { buscarPedidosDoPeriodo, buscarPedidosRecentes } from './pedidosRelatorio';
import { calcularMetricasPorPlataforma } from './trafficSource';
import { calculateIntradayPace } from './ritmoVendas';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function diaSp(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Credenciais da Meta salvas no Supabase (fallback quando não estão no env do Pages). */
export async function carregarCredenciaisMeta(supabase, env) {
  if (!supabase) return env;
  try {
    const { data } = await supabase.from('config').select('valor').eq('chave', 'meta_ads_config').maybeSingle();
    const v = data?.valor;
    if (v && typeof v === 'object') {
      for (const k of ['META_AD_ACCOUNT_ID', 'META_MARKETING_ACCESS_TOKEN', 'META_MARKETING_ACCESS_TOKEN_2']) {
        if (v[k]) env[k] = v[k];
      }
    }
  } catch (e) {
    console.warn('[resumoDia] Aviso ao carregar meta_ads_config:', e?.message);
  }
  return env;
}

/** Aplica os gastos lançados à mão (config manual_ads_spend, chave "canal_AAAA-MM-DD") sobre os da API. */
export function aplicarGastosManuais(spendData, manual, since, until) {
  if (!manual || typeof manual !== 'object') return spendData;
  for (const [key, val] of Object.entries(manual)) {
    const i = key.lastIndexOf('_');
    if (i === -1) continue;
    let canal = key.slice(0, i).toLowerCase();
    const dataStr = key.slice(i + 1);
    if (canal.includes('tiktok')) canal = 'tiktok';
    else if (canal.includes('meta') || canal.includes('facebook')) canal = 'meta';
    else if (canal.includes('google')) canal = 'google';
    else continue;
    if (dataStr < since || dataStr > until) continue;
    if (!spendData[canal]) spendData[canal] = { ok: true, byDate: {}, total: 0 };
    if (!spendData[canal].byDate) spendData[canal].byDate = {};
    spendData[canal].byDate[dataStr] = Number(val) || 0;
    spendData[canal].ok = true;
  }
  for (const canal of ['meta', 'tiktok', 'google']) {
    const byDate = spendData[canal]?.byDate;
    if (byDate) spendData[canal].total = r2(Object.values(byDate).reduce((a, v) => a + (Number(v) || 0), 0));
  }
  return spendData;
}

export async function gastoAnunciosComManual(env, supabase, since, until) {
  await carregarCredenciaisMeta(supabase, env);
  const spendData = await getConsolidatedAdsSpend({ since, until }, env);
  if (supabase) {
    try {
      const { data } = await supabase.from('config').select('valor').eq('chave', 'manual_ads_spend').maybeSingle();
      aplicarGastosManuais(spendData, data?.valor, since, until);
    } catch (e) {
      console.warn('[resumoDia] Aviso ao mesclar gastos manuais:', e?.message);
    }
  }
  return spendData;
}

// O Dashboard roda no navegador e agrupa por dia/hora com getDate()/getHours() locais (Brasília).
// No servidor (Cloudflare) o relógio é UTC: deslocamos todas as datas em -3 h para que essas
// mesmas funções enxerguem o horário de Brasília (fuso fixo, sem horário de verão desde 2019).
const DESLOCAMENTO_SP_MS = 3 * 3600 * 1000;
const ISO = /^\d{4}-\d{2}-\d{2}T/;

export function paraRelogioSp(valor) {
  if (typeof valor === 'string' && ISO.test(valor)) {
    const t = Date.parse(valor);
    return Number.isNaN(t) ? valor : new Date(t - DESLOCAMENTO_SP_MS).toISOString();
  }
  if (Array.isArray(valor)) return valor.map(paraRelogioSp);
  if (valor && typeof valor === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(valor)) out[k] = paraRelogioSp(v);
    return out;
  }
  return valor;
}

/**
 * Resumo do dia com as MESMAS contas do Dashboard:
 *  - faturamento, vendas, Kie e WhatsApp: calcularMetricasPorPlataforma (card "Faturamento e Lucro
 *    por Plataforma", filtrado em hoje);
 *  - anúncios: Meta (+13,8% de imposto sobre a parte em reais) + TikTok + Google, com ajustes manuais;
 *  - lucro = faturamento − anúncios − Kie − WhatsApp;
 *  - ritmo: calculateIntradayPace (card "Ritmo de vendas"), hoje × média dos últimos 7 dias.
 */
export async function calcularResumoDia(envOriginal = {}, agora = new Date()) {
  const env = { ...envOriginal };
  const supabase = getSupabaseEdge(env);
  if (!supabase) throw new Error('Supabase não configurado');

  const dia = diaSp(agora);
  const mes = dia.slice(0, 7);
  const [ano, mesNum] = mes.split('-').map(Number);
  const proxMes = mesNum === 12 ? `${ano + 1}-01` : `${ano}-${String(mesNum + 1).padStart(2, '0')}`;

  const [pedidosMes, pedidosRecentes, ads] = await Promise.all([
    buscarPedidosDoPeriodo(supabase, `${mes}-01T00:00:00-03:00`, `${proxMes}-01T00:00:00-03:00`),
    buscarPedidosRecentes(supabase, 8),
    gastoAnunciosComManual(env, supabase, dia, dia).catch((e) => { console.warn('[resumoDia] Anúncios indisponíveis:', e?.message); return null; }),
  ]);

  const { totais } = calcularMetricasPorPlataforma(paraRelogioSp(pedidosMes), String(Number(dia.slice(8, 10))), mes);

  const metaBase = Number(ads?.meta?.byDate?.[dia]) || 0;
  const metaImposto = r2((Number(ads?.meta?.byDateTaxable?.[dia]) || 0) * 0.138);
  const anuncios = r2(metaBase + metaImposto + (Number(ads?.tiktok?.byDate?.[dia]) || 0) + (Number(ads?.google?.byDate?.[dia]) || 0));
  const kie = r2(totais.gastoKie);
  const whatsapp = r2(totais.gastoWhatsApp);
  const faturamento = r2(totais.faturamento);
  const lucro = r2(faturamento - anuncios - kie - whatsapp);

  const pace = calculateIntradayPace(paraRelogioSp(pedidosRecentes), {
    daysLimit: 7,
    referenceDate: new Date(agora.getTime() - DESLOCAMENTO_SP_MS),
  });

  return {
    ok: true,
    dia,
    atualizadoEm: agora.toISOString(),
    faturamento,
    vendas: totais.pedidosPagos,
    lucro,
    despesas: { anuncios, kie, whatsapp, total: r2(anuncios + kie + whatsapp), anunciosOk: Boolean(ads) },
    ticketMedio: r2(totais.ticketMedioGeral),
    ritmo: {
      percentualVsMedia: Math.round(Number(pace.revenueDiffPercent) || 0),
      vendasVsMediaPercentual: Math.round(Number(pace.paidDiffPercent) || 0),
      mediaAteAgora: r2(pace.avgRevenueAtCurrentHour),
      projecaoFaturamento: r2(pace.projectedDayEndRevenue),
      projecaoVendas: Math.round(Number(pace.projectedDayEndPaid) || 0),
      diasNaMedia: pace.daysAveragedCount || 0,
    },
  };
}
