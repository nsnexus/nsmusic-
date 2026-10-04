import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getConsolidatedAdsSpend } from '@/lib/adsSpend';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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
  const hojeStr = getLocalDateStr(now);

  let since = searchParams.get('since');
  let until = searchParams.get('until');
  const mes = searchParams.get('mes');

  if (mes && (!since || !until)) {
    const [anoStr, mesStr] = mes.split('-');
    const ano = Number(anoStr);
    const mesNum = Number(mesStr);
    const diasNoMes = new Date(ano, mesNum, 0).getDate();
    since = `${mes}-01`;
    until = `${mes}-${String(diasNoMes).padStart(2, '0')}`;
  }

  if (!since) since = hojeStr;
  if (!until) until = hojeStr;

  try {
    const spendData = await getConsolidatedAdsSpend({ since, until }, env);

    // Carrega possíveis gastos manuais salvos na tabela config do Supabase
    try {
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        const { data: configData } = await supabase
          .from('config')
          .select('valor')
          .eq('chave', 'manual_ads_spend')
          .maybeSingle();

        if (configData?.valor && typeof configData.valor === 'object') {
          for (const [key, val] of Object.entries(configData.valor)) {
            const [canal, dataStr] = key.split('_');
            const spendVal = Number(val) || 0;

            if (dataStr >= since && dataStr <= until) {
              if (canal === 'tiktok') {
                if (!spendData.tiktok.byDate) spendData.tiktok.byDate = {};
                spendData.tiktok.byDate[dataStr] = spendVal;
                spendData.tiktok.ok = true;
              } else if (canal === 'meta') {
                if (!spendData.meta.byDate) spendData.meta.byDate = {};
                spendData.meta.byDate[dataStr] = spendVal;
                spendData.meta.ok = true;
              }
            }
          }

          // Recalcula totais com os dados manuais/ajustes
          if (spendData.tiktok?.byDate) {
            let tot = 0;
            for (const v of Object.values(spendData.tiktok.byDate)) tot += Number(v) || 0;
            spendData.tiktok.total = Math.round(tot * 100) / 100;
          }
          if (spendData.meta?.byDate) {
            let tot = 0;
            for (const v of Object.values(spendData.meta.byDate)) tot += Number(v) || 0;
            spendData.meta.total = Math.round(tot * 100) / 100;
          }
        }
      }
    } catch (e) {
      console.warn('[ads-spend] Aviso ao mesclar gastos manuais:', e?.message);
    }

    return NextResponse.json({
      ok: true,
      ...spendData,
    });
  } catch (err) {
    console.error('[ads-spend] Erro ao buscar gastos de anúncios:', err);
    return NextResponse.json({ error: 'Falha ao buscar dados de anúncios' }, { status: 500 });
  }
}

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

  try {
    const body = await req.json().catch(() => null);
    const { channel, date, spend } = body || {};

    if (!channel || !date || spend === undefined) {
      return NextResponse.json({ error: 'Parâmetros inválidos (channel, date, spend)' }, { status: 400 });
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Banco de dados não disponível' }, { status: 500 });
    }

    const { data: configData } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'manual_ads_spend')
      .maybeSingle();

    const current = (configData?.valor && typeof configData.valor === 'object') ? configData.valor : {};
    const key = `${channel}_${date}`;
    current[key] = Math.round(Number(spend) * 100) / 100;

    await supabase.from('config').upsert({
      chave: 'manual_ads_spend',
      valor: current,
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, saved: { key, spend: current[key] } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
