import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';

export async function GET() {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ ok: true, temas: {} });
  }

  try {
    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'carta_temas')
      .maybeSingle();

    const temas = data?.valor || {};
    return NextResponse.json({ ok: true, temas }, {
      headers: {
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600'
      }
    });
  } catch (err) {
    console.warn('[carta/temas] Erro ao buscar temas:', err.message);
    return NextResponse.json({ ok: true, temas: {} });
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
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase não disponível' }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { slotId, ...slotData } = body;

    if (!slotId) {
      return NextResponse.json({ error: 'slotId é obrigatório' }, { status: 400 });
    }

    const { data: currentSnap } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'carta_temas')
      .maybeSingle();

    const currentTemas = currentSnap?.valor || {};
    const updatedTemas = {
      ...currentTemas,
      [slotId]: {
        ...(currentTemas[slotId] || {}),
        ...slotData,
        updatedAt: new Date().toISOString()
      }
    };

    const nowIso = new Date().toISOString();
    await supabase.from('config').upsert({
      chave: 'carta_temas',
      valor: updatedTemas,
      updated_at: nowIso
    }, { onConflict: 'chave' });

    return NextResponse.json({ ok: true, slotId, tema: updatedTemas[slotId] });
  } catch (err) {
    console.error('[carta/temas] Erro ao salvar tema:', err.message);
    return NextResponse.json({ error: 'Falha ao salvar tema' }, { status: 500 });
  }
}
