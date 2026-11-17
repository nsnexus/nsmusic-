// Resumo do dia para o widget da tela inicial (app Android "NS Music Widget"), com as mesmas
// contas do Dashboard (ver calcularResumoDia). Tudo no fuso de Brasília.
import { getSupabaseEdge } from './supabase-edge';
import { getConsolidatedAdsSpend } from './adsSpend';
import { calcularRitmoDeAgregados } from './ritmoVendas';
import { obterMetricasDias, linhasParaRitmo, somarDias } from './metricasDiarias';
import { DESLOCAMENTO_SP_MS, diaSp, paraRelogioSp } from './relogioSp';

export { diaSp, paraRelogioSp };

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

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

/**
 * Resumo do dia com as MESMAS contas do Dashboard, lendo a tabela metricas_diarias:
 *  - faturamento, vendas, Kie e WhatsApp: linha de hoje (card "Faturamento e Lucro por Plataforma");
 *  - anúncios: Meta (+13,8% de imposto sobre a parte em reais) + TikTok + Google, com ajustes manuais;
 *  - lucro = faturamento − anúncios − Kie − WhatsApp;
 *  - ritmo: card "Ritmo de vendas" — hoje × média dos 7 dias anteriores (curvas guardadas na tabela).
 */
export async function calcularResumoDia(envOriginal = {}, agora = new Date()) {
  const env = { ...envOriginal };
  const supabase = getSupabaseEdge(env);
  if (!supabase) throw new Error('Supabase não configurado');

  const dia = diaSp(agora);
  const dias = [dia, ...Array.from({ length: 7 }, (_, i) => somarDias(dia, -(i + 1)))];

  const [linhas, ads] = await Promise.all([
    obterMetricasDias(supabase, dias, dia, agora),
    gastoAnunciosComManual(env, supabase, dia, dia).catch((e) => { console.warn('[resumoDia] Anúncios indisponíveis:', e?.message); return null; }),
  ]);
  const hoje = linhas[dia];

  const metaBase = Number(ads?.meta?.byDate?.[dia]) || 0;
  const metaImposto = r2((Number(ads?.meta?.byDateTaxable?.[dia]) || 0) * 0.138);
  const anuncios = r2(metaBase + metaImposto + (Number(ads?.tiktok?.byDate?.[dia]) || 0) + (Number(ads?.google?.byDate?.[dia]) || 0));
  const kie = r2(hoje.gasto_kie);
  const whatsapp = r2(hoje.gasto_whatsapp);
  const faturamento = r2(hoje.faturamento);
  const lucro = r2(faturamento - anuncios - kie - whatsapp);

  const pace = calcularRitmoDeAgregados(linhasParaRitmo(linhas), {
    daysLimit: 7,
    referenceDate: new Date(agora.getTime() - DESLOCAMENTO_SP_MS),
  });

  return {
    ok: true,
    dia,
    atualizadoEm: hoje.calculado_em || agora.toISOString(),
    faturamento,
    vendas: Number(hoje.vendas) || 0,
    lucro,
    despesas: { anuncios, kie, whatsapp, total: r2(anuncios + kie + whatsapp), anunciosOk: Boolean(ads) },
    ticketMedio: hoje.vendas ? r2(faturamento / hoje.vendas) : 0,
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
