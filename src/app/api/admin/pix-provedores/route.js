import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { contarProvedoresPix } from '@/lib/pixProvedores';
import { diaSp } from '@/lib/relogioSp';
import { inicioDiaUtc, somarDias } from '@/lib/metricasDiarias';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Por qual degrau o PIX está saindo: Efí (normal), InfinitePay (Efí falhou) ou PIX estático
// (as duas falharam; não confirma sozinho). Hoje e últimos 7 dias, a partir de order_payment_intents.
export async function GET(req) {
  let env = {};
  try {
    const contexto = getRequestContext();
    if (contexto?.env) env = { ...contexto.env };
  } catch { /* fora da Cloudflare */ }

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  const supabase = getSupabaseEdge(env);
  if (!supabase) return NextResponse.json({ error: 'Banco não configurado.' }, { status: 500 });

  const hoje = diaSp();
  const desde = inicioDiaUtc(somarDias(hoje, -6));
  const { data, error } = await supabase
    .from('order_payment_intents')
    .select('provider,created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (error) {
    console.warn('[pix-provedores] Falha na consulta:', error.message);
    return NextResponse.json({ error: 'Não foi possível contar os PIX agora.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...contarProvedoresPix(data || [], inicioDiaUtc(hoje)) }, { headers: { 'Cache-Control': 'no-store' } });
}
