import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const admin = await requireAdmin(req, env);
    if (!admin.ok) {
      return NextResponse.json({ error: admin.error || 'Não autorizado.' }, { status: admin.status || 401 });
    }

    const body = await req.json().catch(() => ({}));
    const generations = Number(body?.generations);
    const sales = Number(body?.sales);

    if (!Number.isFinite(generations) || generations < 0 || !Number.isFinite(sales) || sales < 0) {
      return NextResponse.json(
        { error: 'Informe generations e sales como números não negativos.' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não configurado' }, { status: 500 });
    }

    const payload = {
      generations: Math.round(generations),
      sales: Math.round(sales),
      seededAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await supabase.from('config').upsert({
      chave: 'stats',
      valor: payload,
      updated_at: payload.updatedAt
    });

    return NextResponse.json({
      ok: true,
      stats: payload,
    });
  } catch (err) {
    console.error('[stats/seed] Falha ao definir linha de base:', err.message);
    return NextResponse.json({ error: 'Falha ao salvar linha de base.' }, { status: 500 });
  }
}
