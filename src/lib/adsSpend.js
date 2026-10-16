// src/lib/adsSpend.js
// Busca o gasto diário de anúncios via Meta Marketing API e TikTok Marketing API.
// Edge Runtime compatível com Cloudflare Pages.

import { readEnvValue } from './envValue.js';

// Cache em memória (TTL: 5 min)
const adsCache = new Map();

let cachedUsdRate = { rate: 5.20, timestamp: 0 };

/**
 * Obtém a cotação comercial atual de USD para BRL com cache em memória de 1 hora.
 */
export async function getUsdToBrlRate() {
  const now = Date.now();
  if (cachedUsdRate.timestamp && now - cachedUsdRate.timestamp < 60 * 60 * 1000) {
    return cachedUsdRate.rate;
  }
  try {
    const res = await fetch('https://economia.awesomeapi.com.br/last/USD-BRL');
    if (res.ok) {
      const data = await res.json();
      const bid = Number(data?.USDBRL?.bid);
      if (Number.isFinite(bid) && bid > 0) {
        cachedUsdRate = { rate: bid, timestamp: now };
        return bid;
      }
    }
  } catch (e) {
    console.warn('[adsSpend] Erro ao buscar cotação USD/BRL:', e?.message);
  }
  return cachedUsdRate.rate || 5.20;
}

function getCacheKey(channel, since, until) {
  return `${channel}_${since}_${until}`;
}

/**
 * Normaliza uma lista de IDs de contas da Meta (suporta string com vírgula ou array).
 * Retorna array de IDs limpos com prefixo 'act_'.
 */
export function normalizeMetaAccountIds(id) {
  if (!id) return [];
  const rawList = Array.isArray(id) ? id : String(id).split(',');
  const seen = new Set();
  const result = [];

  for (const item of rawList) {
    const clean = String(item || '').trim();
    if (!clean) continue;
    const withPrefix = clean.startsWith('act_') ? clean : `act_${clean}`;
    if (!seen.has(withPrefix)) {
      seen.add(withPrefix);
      result.push(withPrefix);
    }
  }

  return result;
}

/**
 * Normaliza o ID da conta da Meta (adiciona 'act_' se vier só os números).
 * Suporta string única ou separada por vírgula.
 */
export function normalizeMetaAccountId(id) {
  const ids = normalizeMetaAccountIds(id);
  return ids.join(',');
}

/**
 * Busca o gasto diário com Meta Ads (Facebook e Instagram) para um intervalo de datas.
 * Suporta múltiplas contas de anúncios simultaneamente (somando os gastos).
 * Retorna um mapa { [YYYY-MM-DD]: valorGasto } e o total.
 */
export async function fetchMetaDailySpend({ since, until }, env = {}) {
  const accountIdRaw = readEnvValue(env, 'META_AD_ACCOUNT_ID');
  const token1 = readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN');
  const token2 = readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN_2');
  const tokens = [token1, token2].filter(Boolean);

  if (!accountIdRaw || tokens.length === 0) {
    return { ok: false, reason: 'not_configured', byDate: {}, total: 0 };
  }

  const actIds = normalizeMetaAccountIds(accountIdRaw);
  if (actIds.length === 0) {
    return { ok: false, reason: 'not_configured', byDate: {}, total: 0 };
  }

  const cacheKey = `${getCacheKey('meta', since, until)}_${actIds.slice().sort().join('_')}_${tokens.map(t => t.slice(-6)).join('_')}`;
  const cached = adsCache.get(cacheKey);
  const now = Date.now();

  // Cache de 5 minutos
  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  try {
    const timeRange = JSON.stringify({ since, until });
    const byDate = {};
    const byDateTaxable = {};
    let total = 0;
    let totalTaxable = 0;
    let anyOk = false;

    await Promise.all(
      actIds.map(async (actId) => {
        for (const token of tokens) {
          try {
            const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(actId)}/insights?time_range=${encodeURIComponent(timeRange)}&time_increment=1&fields=spend,account_currency&access_token=${encodeURIComponent(token)}`;
            const res = await fetch(url);
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              console.warn(`[adsSpend] Tentativa com token para ${actId} falhou (HTTP ${res.status}):`, errText.slice(0, 200));
              continue;
            }

            const json = await res.json().catch(() => null);
            if (Array.isArray(json?.data)) {
              anyOk = true;
              for (const row of json.data) {
                const dateKey = row.date_start; // YYYY-MM-DD
                const currency = String(row.account_currency || 'BRL').toUpperCase();
                let spend = Number(row.spend) || 0;
                const isUsd = currency === 'USD';
                if (isUsd) {
                  const usdRate = await getUsdToBrlRate();
                  spend = spend * usdRate;
                }
                if (dateKey) {
                  byDate[dateKey] = (byDate[dateKey] || 0) + spend;
                  total += spend;
                  // Contas em dólar NÃO pagam os 13,8% de imposto retido sobre anúncios nacionais
                  if (!isUsd) {
                    byDateTaxable[dateKey] = (byDateTaxable[dateKey] || 0) + spend;
                    totalTaxable += spend;
                  }
                }
              }
              break; // Token funcionou para esta conta
            }
          } catch (e) {
            console.warn(`[adsSpend] Falha ao consultar conta ${actId}:`, e?.message);
          }
        }
      })
    );

    const result = {
      ok: anyOk,
      byDate,
      total: Math.round(total * 100) / 100,
      byDateTaxable,
      totalTaxable: Math.round(totalTaxable * 100) / 100,
    };
    adsCache.set(cacheKey, { timestamp: now, data: result });
    return result;
  } catch (err) {
    console.warn('[adsSpend] Exceção ao consultar Meta Insights:', err?.message);
    return { ok: false, error: err?.message, byDate: {}, total: 0 };
  }
}

/**
 * Busca o gasto diário com TikTok Ads para um intervalo de datas.
 */
export async function fetchTikTokDailySpend({ since, until }, env = {}) {
  const advertiserId = readEnvValue(env, 'TIKTOK_ADVERTISER_ID');
  const token = readEnvValue(env, 'TIKTOK_BUSINESS_ACCESS_TOKEN') || readEnvValue(env, 'TIKTOK_EVENTS_API_ACCESS_TOKEN');

  if (!advertiserId || !token) {
    return { ok: false, reason: 'not_configured', byDate: {}, total: 0 };
  }

  const cacheKey = getCacheKey('tiktok', since, until);
  const cached = adsCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  try {
    const url = new URL('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
    url.searchParams.set('advertiser_id', advertiserId);
    url.searchParams.set('report_type', 'BASIC');
    url.searchParams.set('data_level', 'AUCTION_ADVERTISER');
    url.searchParams.set('dimensions', JSON.stringify(['stat_time_day']));
    url.searchParams.set('metrics', JSON.stringify(['spend']));
    url.searchParams.set('start_date', since);
    url.searchParams.set('end_date', until);

    const res = await fetch(url.toString(), {
      headers: { 'Access-Token': token },
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[adsSpend] Erro ao consultar TikTok Ads (HTTP ${res.status}):`, errText.slice(0, 300));
      return { ok: false, error: `HTTP ${res.status}`, byDate: {}, total: 0 };
    }

    const json = await res.json().catch(() => null);
    if (json?.code !== 0) {
      console.warn('[adsSpend] Resposta de erro da API do TikTok:', json?.code, json?.message);
      return { ok: false, error: json?.message, byDate: {}, total: 0 };
    }

    const byDate = {};
    let total = 0;
    const list = json?.data?.list || [];

    for (const item of list) {
      const rawDate = item.dimensions?.stat_time_day || '';
      const dateKey = rawDate.slice(0, 10);
      const spend = Number(item.metrics?.spend) || 0;
      if (dateKey) {
        byDate[dateKey] = (byDate[dateKey] || 0) + spend;
        total += spend;
      }
    }

    const result = { ok: true, byDate, total: Math.round(total * 100) / 100 };
    adsCache.set(cacheKey, { timestamp: now, data: result });
    return result;
  } catch (err) {
    console.warn('[adsSpend] Exceção ao consultar TikTok Ads:', err?.message);
    return { ok: false, error: err?.message, byDate: {}, total: 0 };
  }
}

/**
 * Retorna os gastos consolidados de Meta e TikTok para o período solicitado.
 */
export async function getConsolidatedAdsSpend({ since, until }, env = {}) {
  const [metaRes, tiktokRes] = await Promise.all([
    fetchMetaDailySpend({ since, until }, env),
    fetchTikTokDailySpend({ since, until }, env),
  ]);

  return {
    meta: metaRes,
    tiktok: tiktokRes,
    google: { ok: true, byDate: {}, total: 0 },
    period: { since, until },
  };
}

/**
 * Busca métricas detalhadas a nível de anúncio (ad) via Meta Marketing API.
 * Retorna lista de anúncios com spend, cliques, impressões, ctr, cpc.
 */
export async function fetchMetaAdLevelInsights({ since, until }, env = {}) {
  const accountIdRaw = readEnvValue(env, 'META_AD_ACCOUNT_ID');
  const token1 = readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN');
  const token2 = readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN_2');
  const tokens = [token1, token2].filter(Boolean);

  if (!accountIdRaw || tokens.length === 0) {
    return { ok: false, reason: 'not_configured', ads: [] };
  }

  const actIds = normalizeMetaAccountIds(accountIdRaw);
  if (actIds.length === 0) {
    return { ok: false, reason: 'not_configured', ads: [] };
  }

  const cacheKey = `${getCacheKey('meta_ad_level', since, until)}_${actIds.slice().sort().join('_')}_${tokens.map(t => t.slice(-6)).join('_')}`;
  const cached = adsCache.get(cacheKey);
  const now = Date.now();

  // Cache de 3 minutos
  if (cached && now - cached.timestamp < 3 * 60 * 1000) {
    return cached.data;
  }

  try {
    const timeRange = JSON.stringify({ since, until });
    const ads = [];
    let anyOk = false;

    await Promise.all(
      actIds.map(async (actId) => {
        for (const token of tokens) {
          try {
            const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(actId)}/insights?level=ad&fields=ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,spend,impressions,clicks,cpc,ctr,account_currency&time_range=${encodeURIComponent(timeRange)}&limit=500&access_token=${encodeURIComponent(token)}`;
            const res = await fetch(url);
            if (!res.ok) {
              const errText = await res.text().catch(() => '');
              console.warn(`[adsSpend] Tentativa de ad insights com token para ${actId} falhou (HTTP ${res.status}):`, errText.slice(0, 200));
              continue;
            }

            const json = await res.json().catch(() => null);
            if (Array.isArray(json?.data)) {
              anyOk = true;
              for (const row of json.data) {
                const currency = String(row.account_currency || 'BRL').toUpperCase();
                let spend = Number(row.spend) || 0;
                let cpc = Number(row.cpc) || 0;
                if (currency === 'USD') {
                  const usdRate = await getUsdToBrlRate();
                  spend = spend * usdRate;
                  cpc = cpc * usdRate;
                }
                ads.push({
                  accountId: actId,
                  adId: String(row.ad_id || ''),
                  adName: String(row.ad_name || 'Sem nome'),
                  campaignId: String(row.campaign_id || ''),
                  campaignName: String(row.campaign_name || 'Campanha sem nome'),
                  adsetId: String(row.adset_id || ''),
                  adsetName: String(row.adset_name || ''),
                  spend: Math.round(spend * 100) / 100,
                  impressions: Number(row.impressions) || 0,
                  clicks: Number(row.clicks) || 0,
                  cpc: Math.round(cpc * 100) / 100,
                  ctr: Number(row.ctr) || 0,
                  currency,
                  originalSpend: Number(row.spend) || 0,
                });
              }
              break; // Token funcionou para esta conta
            }
          } catch (e) {
            console.warn(`[adsSpend] Falha ao consultar ad insights para ${actId}:`, e?.message);
          }
        }
      })
    );

    const result = { ok: anyOk, ads };
    adsCache.set(cacheKey, { timestamp: now, data: result });
    return result;
  } catch (err) {
    console.warn('[adsSpend] Exceção ao consultar Meta Ad Insights:', err?.message);
    return { ok: false, error: err?.message, ads: [] };
  }
}

