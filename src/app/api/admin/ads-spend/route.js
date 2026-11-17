import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { gastoAnunciosComManual } from '@/lib/resumoDia';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getLocalDateStr(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = { ...ctx.env };
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

  const supabase = getSupabaseEdge(env);

  try {
    // Credenciais da Meta salvas no Supabase + gastos lançados à mão: ver src/lib/resumoDia.js
    // (o widget da tela inicial usa a mesma conta).
    const spendData = await gastoAnunciosComManual(env, supabase, since, until);

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
    if (ctx?.env) env = { ...ctx.env };
  } catch (e) {}

  const url = new URL(req.url);
  const secretParam = url.searchParams.get('secret');
  const secretHeader = req.headers.get('x-api-key') || req.headers.get('x-script-secret');
  const providedSecret = secretParam || secretHeader;

  let isAuthorized = false;
  const expectedSecret = env.GOOGLE_ADS_SCRIPT_SECRET || env.CRON_SECRET || env.RECONCILE_SECRET;
  if (expectedSecret && providedSecret === expectedSecret) {
    isAuthorized = true;
  }

  const supabase = getSupabaseEdge(env);

  if (!isAuthorized && providedSecret && supabase) {
    try {
      const { data: conf } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'google_ads_script_secret')
        .maybeSingle();
      if (conf?.valor && String(conf.valor) === providedSecret) {
        isAuthorized = true;
      }
    } catch (e) {}
  }

  if (!isAuthorized) {
    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }
  }

  try {
    const body = await req.json().catch(() => null);
    const { channel, date, spend, entries, days } = body || {};

    const rawChannel = String(channel || '').toLowerCase();
    const normChannel = rawChannel.includes('google')
      ? 'google'
      : rawChannel.includes('tiktok')
        ? 'tiktok'
        : (rawChannel.includes('meta') || rawChannel.includes('facebook') ? 'meta' : 'tiktok');

    if (!channel || (!date && !entries && !Array.isArray(days))) {
      return NextResponse.json({ error: 'Parâmetros inválidos (channel, date/spend ou entries/days)' }, { status: 400 });
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

    const current = (configData?.valor && typeof configData.valor === 'object') ? { ...configData.valor } : {};

    // Suporte a lote via entries { '2026-10-01': 50, ... }
    if (entries && typeof entries === 'object') {
      for (const [entryDate, entrySpend] of Object.entries(entries)) {
        const valNum = Number(entrySpend);
        if (Number.isFinite(valNum) && valNum >= 0) {
          current[`${normChannel}_${entryDate}`] = Math.round(valNum * 100) / 100;
        }
      }
    }

    // Suporte a lote via days [{ date, spend }, ...]
    if (Array.isArray(days)) {
      for (const item of days) {
        if (item?.date) {
          const valNum = Number(item.spend);
          if (Number.isFinite(valNum) && valNum >= 0) {
            current[`${normChannel}_${item.date}`] = Math.round(valNum * 100) / 100;
          }
        }
      }
    }

    // Suporte a dia individual
    if (date && spend !== undefined && spend !== null) {
      const valNum = Number(spend);
      if (Number.isFinite(valNum) && valNum >= 0) {
        current[`${normChannel}_${date}`] = Math.round(valNum * 100) / 100;
      }
    }

    await supabase.from('config').upsert({
      chave: 'manual_ads_spend',
      valor: current,
      updated_at: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, saved: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
