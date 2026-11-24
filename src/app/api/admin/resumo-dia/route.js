import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { calcularResumoDia } from '@/lib/resumoDia';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// "Como está o dia" no topo do Dashboard: os mesmos números do widget do celular
// (faturamento, lucro, vendas, gastos e ritmo × média dos 7 dias), com login de admin.
export async function GET(req) {
  let env = {};
  try {
    const contexto = getRequestContext();
    if (contexto?.env) env = { ...contexto.env };
  } catch { /* fora da Cloudflare */ }

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const resumo = await calcularResumoDia(env);
    return NextResponse.json(resumo, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[resumo-dia] Falha ao calcular:', e?.message);
    return NextResponse.json({ error: 'Não foi possível calcular o resumo do dia agora.' }, { status: 503 });
  }
}
