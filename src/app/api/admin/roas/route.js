import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { obterMetricasDias, somarDias } from '@/lib/metricasDiarias';
import { gastoAnunciosComManual } from '@/lib/resumoDia';
import { fetchMetaHourlySpend, fetchTikTokHourlySpend, roasAcumuladoPorHora } from '@/lib/adsSpendHora';
import { diaSp } from '@/lib/relogioSp';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const IMPOSTO_META = 0.138; // só sobre a parte da conta em reais (igual ao card de plataformas e ao widget)

// ROAS geral do Dashboard: dia a dia no mês e, para hoje, acumulado hora a hora.
// ROAS = faturamento do dia (mesma conta do widget / metricas_diarias) ÷ gasto com anúncios
// (Meta + 13,8% sobre a parte em reais + TikTok + Google, com os lançamentos manuais).
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

  const agora = new Date();
  const hoje = diaSp(agora);
  const mesParam = new URL(req.url).searchParams.get('mes');
  const mes = /^\d{4}-\d{2}$/.test(mesParam || '') ? mesParam : hoje.slice(0, 7);
  const inicio = `${mes}-01`;
  const dias = [];
  for (let d = inicio; d.slice(0, 7) === mes && d <= hoje; d = somarDias(d, 1)) dias.push(d);
  if (dias.length === 0) return NextResponse.json({ ok: true, mes, dias: [], hoje: null });

  try {
    const pendentes = [];
    const [linhas, ads] = await Promise.all([
      // Hoje vale por 15 min aqui (5 min no resto): o card de ROAS abre junto com "Como está o dia" e
      // o resumo do mês, e os três recalculando "hoje" ao mesmo tempo sobrecarregavam o banco.
      obterMetricasDias(supabase, dias, hoje, agora, { maxRecalculos: 4, pendentes, validadeHojeMs: 15 * 60 * 1000 }),
      gastoAnunciosComManual(env, supabase, inicio, dias[dias.length - 1]).catch((e) => {
        console.warn('[roas] Gasto com anúncios indisponível:', e?.message);
        return null;
      }),
    ]);

    const gastoDoDia = (dia) => {
      const meta = Number(ads?.meta?.byDate?.[dia]) || 0;
      const imposto = (Number(ads?.meta?.byDateTaxable?.[dia]) || 0) * IMPOSTO_META;
      return r2(meta + imposto + (Number(ads?.tiktok?.byDate?.[dia]) || 0) + (Number(ads?.google?.byDate?.[dia]) || 0));
    };

    const porDia = dias.map((dia) => {
      const linha = linhas[dia];
      const faturamento = linha ? r2(linha.faturamento) : null;
      const gasto = ads ? gastoDoDia(dia) : null;
      return {
        dia,
        faturamento,
        gasto,
        roas: faturamento !== null && gasto > 0 ? r2(faturamento / gasto) : null,
      };
    });

    // Hoje, hora a hora (só quando o mês pedido é o atual).
    let horaria = null;
    if (mes === hoje.slice(0, 7) && linhas[hoje]) {
      const [meta, tiktok] = await Promise.all([fetchMetaHourlySpend(hoje, env), fetchTikTokHourlySpend(hoje, env)]);
      const gastoHora = Array.from({ length: 24 }, (_, h) => (
        meta.porHora[h] + meta.tributavelPorHora[h] * IMPOSTO_META + tiktok.porHora[h]
      ));
      const horaAtual = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(agora));
      horaria = {
        dia: hoje,
        horas: roasAcumuladoPorHora((linhas[hoje].receita_hora || []).map(Number), gastoHora, horaAtual),
        metaOk: meta.ok,
        tiktokOk: tiktok.ok,
        // Google só tem total diário (manual): fica fora da curva por hora.
        googleForaDaCurva: (Number(ads?.google?.byDate?.[hoje]) || 0) > 0,
      };
    }

    return NextResponse.json({
      ok: true,
      mes,
      dias: porDia,
      horaria,
      anunciosOk: Boolean(ads),
      diasPendentes: pendentes.length,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[roas] Falha:', e?.message);
    return NextResponse.json({ error: 'Não foi possível calcular o ROAS agora.' }, { status: 503 });
  }
}
