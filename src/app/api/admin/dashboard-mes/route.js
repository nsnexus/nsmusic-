import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { obterMetricasDias, linhasParaRitmo, somarDias } from '@/lib/metricasDiarias';
import { combinarMes } from '@/lib/dashboardAgregados';
import { calcularRitmoDeAgregados } from '@/lib/ritmoVendas';
import { DESLOCAMENTO_SP_MS, diaSp } from '@/lib/relogioSp';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Resumo do mês para o Dashboard, lido de metricas_diarias (dias fechados ficam guardados; só os
// dias ainda abertos são recalculados). Substitui baixar todos os pedidos do mês no navegador.
export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = { ...ctx.env };
  } catch (e) { /* fora da Cloudflare */ }

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  const agora = new Date();
  const hoje = diaSp(agora);
  const mes = new URL(req.url).searchParams.get('mes') || hoje.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: 'Parâmetro mes inválido (use AAAA-MM).' }, { status: 400 });
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) return NextResponse.json({ error: 'Supabase não configurado no servidor' }, { status: 503 });

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const diasDoMes = Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`).filter((d) => d <= hoje);
  const diasRitmo = [hoje, ...Array.from({ length: 7 }, (_, i) => somarDias(hoje, -(i + 1)))];

  try {
    const pendentes = [];
    const linhas = await obterMetricasDias(supabase, [...new Set([...diasDoMes, ...diasRitmo])], hoje, agora, { maxRecalculos: 6, pendentes });

    const detalhes = {};
    for (const d of diasDoMes) if (linhas[d]?.detalhes) detalhes[d] = linhas[d].detalhes;

    const ritmoLinhas = {};
    for (const d of diasRitmo) if (linhas[d]) ritmoLinhas[d] = linhas[d];
    const ritmo = calcularRitmoDeAgregados(linhasParaRitmo(ritmoLinhas), {
      daysLimit: 7,
      referenceDate: new Date(agora.getTime() - DESLOCAMENTO_SP_MS),
    });

    // incompleto: ainda há dias sendo montados pela primeira vez — o Dashboard pede de novo.
    return NextResponse.json({ ok: true, hoje, incompleto: pendentes.length > 0, diasPendentes: pendentes.length, ...combinarMes(detalhes, mes), ritmo }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[dashboard-mes] Falha:', e?.message);
    return NextResponse.json({ error: 'Não foi possível montar o resumo do mês agora.' }, { status: 503 });
  }
}
