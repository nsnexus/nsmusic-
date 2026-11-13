import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getAbandonedPixRecoveryMetrics, runAbandonedPixRecovery } from '@/lib/abandonedPixRecovery';

export const runtime = 'edge';

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const metrics = await getAbandonedPixRecoveryMetrics({ env });

    return NextResponse.json({
      ok: true,
      metrics,
    });
  } catch (err) {
    console.error('[admin/recovery-metrics] Erro ao buscar métricas:', err.message);
    return NextResponse.json({ error: 'Falha ao buscar métricas de recuperação.' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // Disparo manual imediato
    if (action === 'trigger_now') {
      const result = await runAbandonedPixRecovery({ env, force: true });
      const metrics = await getAbandonedPixRecoveryMetrics({ env });
      return NextResponse.json({
        ok: true,
        result,
        metrics,
      });
    }

    // Alternar ON/OFF da automação
    if (action === 'toggle') {
      const supabase = getSupabaseEdge(env);
      if (!supabase) {
        return NextResponse.json({ error: 'Supabase indisponível.' }, { status: 500 });
      }

      const { data: currentRecord } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'site')
        .maybeSingle();

      const currentValor = currentRecord?.valor || {};
      const newEnabled = Boolean(body.enabled);
      const newValor = {
        ...currentValor,
        abandonedPixRecoveryEnabled: newEnabled,
        abandonedPixRecoveryEnabledAtualizadoEm: new Date().toISOString(),
      };

      await supabase.from('config').upsert({
        chave: 'site',
        valor: newValor,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({
        ok: true,
        enabled: newEnabled,
      });
    }

    // Atualizar limite por lote horário
    if (action === 'update_limit') {
      const supabase = getSupabaseEdge(env);
      if (!supabase) {
        return NextResponse.json({ error: 'Supabase indisponível.' }, { status: 500 });
      }

      const { data: currentRecord } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'site')
        .maybeSingle();

      const currentValor = currentRecord?.valor || {};
      const newLimit = Math.max(1, Math.min(50, Number(body.limit) || 15));
      const newValor = {
        ...currentValor,
        abandonedPixRecoveryMaxPerHour: newLimit,
        abandonedPixRecoveryMaxPerHourAtualizadoEm: new Date().toISOString(),
      };

      await supabase.from('config').upsert({
        chave: 'site',
        valor: newValor,
        updated_at: new Date().toISOString(),
      });

      return NextResponse.json({
        ok: true,
        limit: newLimit,
      });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/recovery-metrics] Erro na requisição:', err.message);
    return NextResponse.json({ error: 'Falha ao processar solicitação.' }, { status: 500 });
  }
}

