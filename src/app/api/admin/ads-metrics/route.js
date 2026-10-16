import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { fetchMetaAdLevelInsights, normalizeMetaAccountId } from '@/lib/adsSpend';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeKey(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const hojeStr = new Date(now.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);

  let since = searchParams.get('since') || hojeStr;
  let until = searchParams.get('until') || hojeStr;

  const supabase = getSupabaseEdge(env);

  // Carrega credenciais da Meta salvas no Supabase
  if (supabase) {
    try {
      const { data: metaConf } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'meta_ads_config')
        .maybeSingle();

      if (metaConf?.valor && typeof metaConf.valor === 'object') {
        if (metaConf.valor.META_AD_ACCOUNT_ID) {
          env.META_AD_ACCOUNT_ID = metaConf.valor.META_AD_ACCOUNT_ID;
        }
        if (metaConf.valor.META_MARKETING_ACCESS_TOKEN) {
          env.META_MARKETING_ACCESS_TOKEN = metaConf.valor.META_MARKETING_ACCESS_TOKEN;
        }
        if (metaConf.valor.META_MARKETING_ACCESS_TOKEN_2) {
          env.META_MARKETING_ACCESS_TOKEN_2 = metaConf.valor.META_MARKETING_ACCESS_TOKEN_2;
        }
      }
    } catch (e) {
      console.warn('[ads-metrics] Erro ao carregar meta_ads_config:', e?.message);
    }
  }

  // 1. Busca anúncios e métricas da Meta Marketing API
  const metaResult = await fetchMetaAdLevelInsights({ since, until }, env);
  const metaAds = Array.isArray(metaResult?.ads) ? metaResult.ads : [];

  // 2. Busca pedidos no Supabase para o período (fuso de Brasília UTC-3)
  const ordersByUtm = new Map();
  let totalPurchasesAll = 0;
  let totalRevenueAll = 0;

  if (supabase) {
    try {
      let pageOffset = 0;
      const pageSize = 1000;

      // Pega pedidos a partir de 2 dias antes do início para cobrir fusos e pedidos gerados antes e pagos no período
      const sinceDate = new Date(`${since}T00:00:00-03:00`);
      const lookbackTime = !isNaN(sinceDate.getTime())
        ? sinceDate.getTime() - 48 * 3600 * 1000
        : Date.now() - 30 * 24 * 3600 * 1000;
      const lookbackIso = new Date(lookbackTime).toISOString();

      while (true) {
        const { data: rows, error } = await supabase
          .from('orders')
          .select('id, order_number, payment_status, paid_at, created_at, extras')
          .gte('created_at', lookbackIso)
          .order('created_at', { ascending: false })
          .range(pageOffset, pageOffset + pageSize - 1);

        if (error) {
          console.warn('[ads-metrics] Erro ao buscar pedidos no Supabase:', error.message);
          break;
        }

        if (!rows || rows.length === 0) break;

        for (const row of rows) {
          const extras = (row.extras && typeof row.extras === 'object') ? row.extras : {};
          const isPaid = row.payment_status === 'PAGO' || row.payment_status === 'PAGAMENTO_APROVADO';

          // Checa se a data do pedido (ou paid_at) está dentro da janela no fuso de São Paulo
          const refDate = isPaid && row.paid_at ? row.paid_at : row.created_at;
          if (refDate) {
            const refDay = new Date(refDate).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
            if (refDay < since || refDay > until) continue;
          }

          let revenue = 0;
          if (isPaid) {
            const val = Number(extras.paidAmount ?? extras.expectedAmount ?? extras.amount);
            revenue = Number.isFinite(val) && val > 0 ? val : 9.99;
            totalPurchasesAll += 1;
            totalRevenueAll += revenue;
          }

          const adIdentifier = String(extras.utmContent || extras.utm_content || '').trim();
          const campaignIdentifier = String(extras.utmCampaign || extras.utm_campaign || '').trim();
          const source = String(extras.utmSource || extras.utm_source || extras.trafficSource || '').toLowerCase();

          // Identifica o canal ou campanha/anúncio
          const key = adIdentifier || campaignIdentifier || (source ? `Canal: ${source}` : 'Direto / Sem UTM');

          const current = ordersByUtm.get(key) || {
            key,
            adName: adIdentifier || key,
            campaignName: campaignIdentifier || (source ? `Origem: ${source}` : 'Não identificada'),
            ordersCount: 0,
            paidCount: 0,
            revenue: 0,
          };

          current.ordersCount += 1;
          if (isPaid) {
            current.paidCount += 1;
            current.revenue += revenue;
          }

          ordersByUtm.set(key, current);
        }

        if (rows.length < pageSize) break;
        pageOffset += pageSize;
      }
    } catch (err) {
      console.warn('[ads-metrics] Exceção ao consultar pedidos:', err.message);
    }
  }

  // 3. Cruzamento entre Anúncios da Meta e Vendas do Banco
  const matchedOrdersKeys = new Set();
  const adRows = [];

  for (const metaAd of metaAds) {
    const metaNorm = normalizeKey(metaAd.adName);
    const metaId = String(metaAd.adId).trim();

    // Tenta encontrar correspondência no mapa de pedidos
    let matchedOrder = null;
    let matchedKeyFound = null;

    for (const [key, ord] of ordersByUtm.entries()) {
      if (matchedOrdersKeys.has(key)) continue;

      const orderNorm = normalizeKey(ord.adName);
      if (
        orderNorm === metaNorm ||
        key === metaId ||
        ord.adName === metaAd.adName ||
        (metaNorm && orderNorm && (orderNorm.includes(metaNorm) || metaNorm.includes(orderNorm)))
      ) {
        matchedOrder = ord;
        matchedKeyFound = key;
        break;
      }
    }

    if (matchedKeyFound) {
      matchedOrdersKeys.add(matchedKeyFound);
    }

    const purchases = matchedOrder ? matchedOrder.paidCount : 0;
    const revenue = matchedOrder ? Math.round(matchedOrder.revenue * 100) / 100 : 0;
    const spend = Math.round(metaAd.spend * 100) / 100;

    const cpa = purchases > 0 ? Math.round((spend / purchases) * 100) / 100 : 0;
    const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : (revenue > 0 ? 999 : 0);
    const profit = Math.round((revenue - spend) * 100) / 100;

    adRows.push({
      adId: metaAd.adId,
      adName: metaAd.adName,
      campaignName: metaAd.campaignName,
      adsetName: metaAd.adsetName,
      source: 'meta_api',
      spend,
      purchases,
      revenue,
      cpa,
      roas,
      profit,
      impressions: metaAd.impressions,
      clicks: metaAd.clicks,
      ctr: metaAd.ctr,
      cpc: metaAd.cpc,
      hasMetaSync: true,
    });
  }

  // Adiciona vendas de anúncios identificados via UTM que não vieram na API da Meta
  for (const [key, ord] of ordersByUtm.entries()) {
    if (matchedOrdersKeys.has(key)) continue;
    if (ord.paidCount === 0 && ord.ordersCount === 0) continue;

    const revenue = Math.round(ord.revenue * 100) / 100;
    adRows.push({
      adId: `utm_${key}`,
      adName: ord.adName,
      campaignName: ord.campaignName,
      adsetName: '-',
      source: 'utm_orders',
      spend: 0,
      purchases: ord.paidCount,
      revenue,
      cpa: 0,
      roas: revenue > 0 ? 999 : 0,
      profit: revenue,
      impressions: 0,
      clicks: 0,
      ctr: 0,
      cpc: 0,
      hasMetaSync: false,
    });
  }

  // 4. Totais consolidados
  let totalSpend = 0;
  let totalPurchases = 0;
  let totalRevenue = 0;
  let totalClicks = 0;
  let totalImpressions = 0;

  for (const row of adRows) {
    totalSpend += row.spend;
    totalPurchases += row.purchases;
    totalRevenue += row.revenue;
    totalClicks += row.clicks;
    totalImpressions += row.impressions;
  }

  totalSpend = Math.round(totalSpend * 100) / 100;
  totalRevenue = Math.round(Math.max(totalRevenue, totalRevenueAll) * 100) / 100;
  totalPurchases = Math.max(totalPurchases, totalPurchasesAll);
  const totalProfit = Math.round((totalRevenue - totalSpend) * 100) / 100;
  const averageCpa = totalPurchases > 0 ? Math.round((totalSpend / totalPurchases) * 100) / 100 : 0;
  const overallRoas = totalSpend > 0 ? Math.round((totalRevenue / totalSpend) * 100) / 100 : (totalRevenue > 0 ? 999 : 0);

  return NextResponse.json({
    ok: true,
    metaConnected: metaResult.ok,
    metaReason: metaResult.reason || metaResult.error || null,
    since,
    until,
    summary: {
      totalSpend,
      totalPurchases,
      totalRevenue,
      averageCpa,
      overallRoas,
      totalProfit,
      totalClicks,
      totalImpressions,
    },
    ads: adRows,
  });
}

/**
 * Salva a configuração de credenciais da Meta Marketing API (ID e Token)
 * no Supabase na tabela config (chave: meta_ads_config).
 */
export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase não disponível' }, { status: 500 });
  }

  try {
    const body = await req.json().catch(() => null);
    const { accountId, accessToken, accessToken2 } = body || {};

    if (!accountId && !accessToken && !accessToken2) {
      return NextResponse.json({ error: 'Informe o ID da conta ou Token' }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'meta_ads_config')
      .maybeSingle();

    const current = (existing?.valor && typeof existing.valor === 'object') ? existing.valor : {};

    const updated = {
      ...current,
      META_AD_ACCOUNT_ID: accountId ? normalizeMetaAccountId(accountId) : current.META_AD_ACCOUNT_ID,
      META_MARKETING_ACCESS_TOKEN: accessToken ? String(accessToken).trim() : current.META_MARKETING_ACCESS_TOKEN,
      META_MARKETING_ACCESS_TOKEN_2: accessToken2 ? String(accessToken2).trim() : current.META_MARKETING_ACCESS_TOKEN_2,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await supabase.from('config').upsert({
      chave: 'meta_ads_config',
      valor: updated,
      updated_at: new Date().toISOString(),
    });

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: 'Configuração da Meta Ads salva com sucesso!' });
  } catch (err) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
