import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function toBrStartIso(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T00:00:00-03:00`;
}

function toBrEndIso(dateStr) {
  if (!dateStr) return null;
  if (dateStr.includes('T')) return dateStr;
  return `${dateStr}T23:59:59.999-03:00`;
}

/**
 * POST /api/analytics/visit
 * Registra um acesso/visita anônima de forma leve (1 requisição por sessão do usuário).
 */
export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    const {
      sessionId,
      platform = 'direto',
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      pagePath = '/',
      referrer
    } = body;

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ ok: false, error: 'supabase_not_configured' }, { status: 200 });
    }

    // Sanitização e limitação de comprimento
    const cleanStr = (val, maxLen = 120) => (typeof val === 'string' ? val.trim().slice(0, maxLen) : null);

    const visitPayload = {
      session_id: cleanStr(sessionId, 64),
      platform: cleanStr(platform, 32) || 'direto',
      utm_source: cleanStr(utmSource, 100),
      utm_medium: cleanStr(utmMedium, 100),
      utm_campaign: cleanStr(utmCampaign, 100),
      utm_content: cleanStr(utmContent, 100),
      utm_term: cleanStr(utmTerm, 100),
      page_path: cleanStr(pagePath, 200) || '/',
      referrer: cleanStr(referrer, 300),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('site_visits').insert(visitPayload);
    if (error) {
      // Se a tabela ainda não tiver sido criada no Supabase, loga sem travar o cliente
      console.warn('[analytics/visit] Aviso ao salvar visita:', error.message);
      return NextResponse.json({ ok: true, saved: false, notice: error.message }, { status: 200 });
    }

    return NextResponse.json({ ok: true, saved: true }, { status: 200 });
  } catch (err) {
    console.warn('[analytics/visit] Exceção ao processar visita:', err?.message);
    return NextResponse.json({ ok: true, saved: false }, { status: 200 });
  }
}

/**
 * GET /api/analytics/visit?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
 * Retorna contagem de visitas no período por plataforma para o Dashboard Admin.
 */
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
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ ok: true, total: 0, byPlatform: {}, error: 'supabase_not_configured' });
  }

  try {
    let query = supabase.from('site_visits').select('platform, created_at');

    const fromIso = toBrStartIso(dateFrom);
    const toIso = toBrEndIso(dateTo);

    if (fromIso) query = query.gte('created_at', fromIso);
    if (toIso) query = query.lte('created_at', toIso);

    const { data, error } = await query;
    if (error) {
      // Tabela não criada ainda
      return NextResponse.json({
        ok: true,
        total: 0,
        byPlatform: {},
        tablePending: true,
        message: error.message,
      });
    }

    const rows = Array.isArray(data) ? data : [];
    const byPlatform = {};
    for (const r of rows) {
      const plat = r.platform || 'direto';
      byPlatform[plat] = (byPlatform[plat] || 0) + 1;
    }

    return NextResponse.json({
      ok: true,
      total: rows.length,
      byPlatform,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      }
    });
  } catch (err) {
    console.warn('[analytics/visit/get] Erro ao consultar visitas:', err?.message);
    return NextResponse.json({ ok: true, total: 0, byPlatform: {}, error: err?.message });
  }
}
