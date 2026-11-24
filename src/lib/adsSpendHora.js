// Gasto com anúncios HORA A HORA de um dia (para o ROAS ao longo do dia no Dashboard).
//
// Meta: Insights com breakdown hourly_stats_aggregated_by_advertiser_time_zone (horário do fuso
// da conta de anúncios — a conta do NS Music é em Brasília). TikTok: relatório BASIC com
// dimensão stat_time_hour. Google não tem gasto por hora aqui (só o total do dia, lançado à mão).
//
// Devolve sempre 24 posições (0..23), em reais. Contas Meta em dólar são convertidas e ficam fora
// da base dos 13,8% de imposto, como no gasto diário (src/lib/adsSpend.js).
import { readEnvValue } from './envValue.js';
import { getUsdToBrlRate, normalizeMetaAccountIds } from './adsSpend.js';

const vazio = () => Array(24).fill(0);
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function horaDoIntervalo(texto) {
  // "13:00:00 - 13:59:59"  ou  "2026-11-23 13:00:00"
  const m = String(texto || '').match(/(?:^|\s)(\d{2}):\d{2}:\d{2}/);
  const h = m ? Number(m[1]) : NaN;
  return Number.isInteger(h) && h >= 0 && h < 24 ? h : null;
}

export async function fetchMetaHourlySpend(dia, env = {}, fetchImpl = fetch) {
  const accountIdRaw = readEnvValue(env, 'META_AD_ACCOUNT_ID');
  const tokens = [readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN'), readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN_2')].filter(Boolean);
  const actIds = normalizeMetaAccountIds(accountIdRaw);
  if (actIds.length === 0 || tokens.length === 0) return { ok: false, reason: 'not_configured', porHora: vazio(), tributavelPorHora: vazio() };

  const chave = `meta_h_${dia}_${actIds.join('_')}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.t < CACHE_MS) return c.d;

  const porHora = vazio();
  const tributavelPorHora = vazio();
  let algumOk = false;
  const timeRange = encodeURIComponent(JSON.stringify({ since: dia, until: dia }));

  await Promise.all(actIds.map(async (actId) => {
    for (const token of tokens) {
      let url = `https://graph.facebook.com/v20.0/${encodeURIComponent(actId)}/insights?time_range=${timeRange}`
        + '&breakdowns=hourly_stats_aggregated_by_advertiser_time_zone&fields=spend,account_currency&limit=100'
        + `&access_token=${encodeURIComponent(token)}`;
      let funcionou = false;
      for (let pagina = 0; url && pagina < 5; pagina++) {
        let res;
        try {
          res = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
        } catch (e) {
          console.warn(`[adsSpendHora] Meta ${actId}: falha de rede (${e?.name})`);
          break;
        }
        if (!res.ok) {
          console.warn(`[adsSpendHora] Meta ${actId}: HTTP ${res.status}`);
          break;
        }
        const json = await res.json().catch(() => null);
        if (!Array.isArray(json?.data)) break;
        funcionou = true;
        for (const row of json.data) {
          const h = horaDoIntervalo(row.hourly_stats_aggregated_by_advertiser_time_zone);
          if (h === null) continue;
          const usd = String(row.account_currency || 'BRL').toUpperCase() === 'USD';
          let gasto = Number(row.spend) || 0;
          if (usd) gasto *= await getUsdToBrlRate();
          porHora[h] += gasto;
          if (!usd) tributavelPorHora[h] += gasto;
        }
        url = json?.paging?.next || null;
      }
      if (funcionou) { algumOk = true; break; }
    }
  }));

  const d = { ok: algumOk, porHora, tributavelPorHora };
  if (algumOk) cache.set(chave, { t: Date.now(), d });
  return d;
}

export async function fetchTikTokHourlySpend(dia, env = {}, fetchImpl = fetch) {
  const advertiserId = readEnvValue(env, 'TIKTOK_ADVERTISER_ID');
  const token = readEnvValue(env, 'TIKTOK_BUSINESS_ACCESS_TOKEN') || readEnvValue(env, 'TIKTOK_EVENTS_API_ACCESS_TOKEN');
  if (!advertiserId || !token) return { ok: false, reason: 'not_configured', porHora: vazio() };

  const chave = `tiktok_h_${dia}`;
  const c = cache.get(chave);
  if (c && Date.now() - c.t < CACHE_MS) return c.d;

  const url = new URL('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
  url.searchParams.set('advertiser_id', advertiserId);
  url.searchParams.set('report_type', 'BASIC');
  url.searchParams.set('data_level', 'AUCTION_ADVERTISER');
  url.searchParams.set('dimensions', JSON.stringify(['stat_time_hour']));
  url.searchParams.set('metrics', JSON.stringify(['spend']));
  url.searchParams.set('start_date', dia);
  url.searchParams.set('end_date', dia);
  url.searchParams.set('page_size', '100');

  try {
    const res = await fetchImpl(url.toString(), { headers: { 'Access-Token': token }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      console.warn(`[adsSpendHora] TikTok: HTTP ${res.status}`);
      return { ok: false, porHora: vazio() };
    }
    const json = await res.json().catch(() => null);
    if (json?.code !== 0) {
      console.warn('[adsSpendHora] TikTok: código', json?.code);
      return { ok: false, porHora: vazio() };
    }
    const porHora = vazio();
    for (const item of json?.data?.list || []) {
      const h = horaDoIntervalo(item.dimensions?.stat_time_hour);
      if (h !== null) porHora[h] += Number(item.metrics?.spend) || 0;
    }
    const d = { ok: true, porHora };
    cache.set(chave, { t: Date.now(), d });
    return d;
  } catch (e) {
    console.warn(`[adsSpendHora] TikTok: falha (${e?.name})`);
    return { ok: false, porHora: vazio() };
  }
}

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * ROAS acumulado hora a hora: faturamento até a hora h ÷ gasto até a hora h.
 * `receitaHora` = receita por hora do pagamento (metricas_diarias.receita_hora).
 * Horas futuras (depois de `horaAtual`) ficam null.
 */
export function roasAcumuladoPorHora(receitaHora, gastoHora, horaAtual = 23) {
  let receita = 0;
  let gasto = 0;
  return Array.from({ length: 24 }, (_, h) => {
    receita += Number(receitaHora?.[h]) || 0;
    gasto += Number(gastoHora?.[h]) || 0;
    if (h > horaAtual) return { hora: h, receita: null, gasto: null, roas: null };
    return { hora: h, receita: r2(receita), gasto: r2(gasto), roas: gasto > 0 ? r2(receita / gasto) : null };
  });
}
