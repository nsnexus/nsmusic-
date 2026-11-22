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

export async function GET(req) {
  let env = {};
  let gravarEmSegundoPlano;
  try {
    const contexto = getRequestContext();
    if (contexto?.env) env = { ...contexto.env };
    if (contexto?.ctx?.waitUntil) {
      gravarEmSegundoPlano = (gravacao) => contexto.ctx.waitUntil(gravacao);
    }
  } catch { /* fora da Cloudflare */ }

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  const agora = new Date();
  const hoje = diaSp(agora);
  const params = new URL(req.url).searchParams;
  const periodo = params.get('periodo') || (params.has('mes') ? 'mes' : 'hoje');
  if (!['hoje', 'ontem', 'mes', 'ritmo'].includes(periodo)) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
  }

  const dia = periodo === 'hoje' ? hoje : periodo === 'ontem' ? somarDias(hoje, -1) : null;
  const mes = dia?.slice(0, 7) || params.get('mes') || hoje.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: 'Parâmetro mes inválido (use AAAA-MM).' }, { status: 400 });
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) return NextResponse.json({ error: 'Supabase não configurado no servidor' }, { status: 503 });

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
  let dias;
  if (dia) {
    dias = [dia];
  } else if (periodo === 'ritmo') {
    dias = Array.from({ length: 8 }, (_, i) => somarDias(hoje, -i));
  } else {
    dias = Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
      .filter((data) => data <= hoje);
  }

  const restantes = params.get('dias')?.split(',');
  if (restantes && !restantes.every((data) => dias.includes(data))) {
    return NextResponse.json({ error: 'Datas fora do período selecionado.' }, { status: 400 });
  }
  const diasConsultados = restantes ? [...new Set(restantes)] : dias;
  const headers = { 'Cache-Control': 'no-store' };

  try {
    const pendentes = [];
    const linhas = diasConsultados.length
      ? await obterMetricasDias(supabase, diasConsultados, hoje, agora, {
        maxRecalculos: periodo === 'ritmo' ? 8 : 6,
        pendentes,
        gravarEmSegundoPlano: dia ? gravarEmSegundoPlano : undefined,
      })
      : {};

    if (periodo === 'ritmo') {
      const ritmo = calcularRitmoDeAgregados(linhasParaRitmo(linhas), {
        daysLimit: 7,
        referenceDate: new Date(agora.getTime() - DESLOCAMENTO_SP_MS),
      });
      return NextResponse.json({ ok: true, ritmo, incompleto: pendentes.length > 0 }, { headers });
    }

    const detalhes = Object.fromEntries(
      diasConsultados.filter((data) => linhas[data]?.detalhes).map((data) => [data, linhas[data].detalhes])
    );
    const diasDaSerie = dias.filter((data) => detalhes[data]).map((data) => Number(data.slice(-2)));
    return NextResponse.json({
      ok: true,
      periodo,
      hoje,
      dia,
      dias: diasDaSerie,
      incompleto: pendentes.length > 0,
      diasPendentes: pendentes.length,
      pendentes,
      // A próxima chamada pode consultar apenas as datas que ficaram pendentes.
      ...((pendentes.length || restantes) ? { detalhes } : {}),
      ...combinarMes(detalhes, mes, diasDaSerie),
    }, { headers });
  } catch (e) {
    console.warn('[dashboard-mes] Falha:', e?.message);
    return NextResponse.json({ error: 'Não foi possível carregar o período agora.' }, { status: 503 });
  }
}
