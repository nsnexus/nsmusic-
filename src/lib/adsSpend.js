// src/lib/adsSpend.js
// Busca o gasto diário de anúncios via Meta Marketing API e TikTok Marketing API.
// Edge Runtime compatível com Cloudflare Pages.

import { readEnvValue } from './envValue.js';

// Cache em memória (TTL: 5 min)
const adsCache = new Map();

function getCacheKey(channel, since, until) {
  return `${channel}_${since}_${until}`;
}

/**
 * Normaliza o ID da conta da Meta (adiciona 'act_' se vier só os números).
 */
export function normalizeMetaAccountId(id) {
  if (!id) return '';
  const clean = String(id).trim();
  return clean.startsWith('act_') ? clean : `act_${clean}`;
}

/**
 * Busca o gasto diário com Meta Ads (Facebook e Instagram) para um intervalo de datas.
 * Retorna um mapa { [YYYY-MM-DD]: valorGasto } e o total.
 */
export async function fetchMetaDailySpend({ since, until }, env = {}) {
  const accountIdRaw = readEnvValue(env, 'META_AD_ACCOUNT_ID');
  const token = readEnvValue(env, 'META_MARKETING_ACCESS_TOKEN');

  if (!accountIdRaw || !token) {
    return { ok: false, reason: 'not_configured', byDate: {}, total: 0 };
  }

  const actId = normalizeMetaAccountId(accountIdRaw);
  const cacheKey = getCacheKey('meta', since, until);
  const cached = adsCache.get(cacheKey);
  const now = Date.now();

  // Cache de 5 minutos
  if (cached && now - cached.timestamp < 5 * 60 * 1000) {
    return cached.data;
  }

  try {
    const timeRange = JSON.stringify({ since, until });
    const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(actId)}/insights?time_range=${encodeURIComponent(timeRange)}&time_increment=1&fields=spend&access_token=${encodeURIComponent(token)}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[adsSpend] Erro ao consultar Meta Insights (HTTP ${res.status}):`, errText.slice(0, 300));
      return { ok: false, error: `HTTP ${res.status}`, byDate: {}, total: 0 };
    }

    const json = await res.json().catch(() => null);
    const byDate = {};
    let total = 0;

    if (Array.isArray(json?.data)) {
      for (const row of json.data) {
        const dateKey = row.date_start; // YYYY-MM-DD
        const spend = Number(row.spend) || 0;
        if (dateKey) {
          byDate[dateKey] = (byDate[dateKey] || 0) + spend;
          total += spend;
        }
      }
    }

    const result = { ok: true, byDate, total: Math.round(total * 100) / 100 };
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
    period: { since, until },
  };
}
