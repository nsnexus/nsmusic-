import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { requireAdmin } from '@/lib/auth';
import { runAbandonedPixRecovery } from '@/lib/abandonedPixRecovery';
import { executarAutomacao } from '@/lib/instagramAutomacao';

export const runtime = 'edge';

/**
 * Endpoint executado periodicamente (a cada 1 hora) por agendador externo ou disparado manualmente pelo admin.
 * Executa a reconciliação de indicações e a recuperação de PIX abandonado da Meta Cloud API.
 */
async function handleRecover(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const cronSecret = String(env.CRON_SECRET || process.env.CRON_SECRET || '').trim();
    const authHeader = req.headers?.get?.('authorization') || '';

    let isAuthorized = false;

    // 1. Autorização via Bearer Token do Cron
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      isAuthorized = true;
    } else {
      // 2. Autorização via sessão de Administrador (para acionamento manual do painel)
      const adminAuth = await requireAdmin(req, env);
      if (adminAuth.ok) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    // Reconcilia recompensas de indicação pendentes
    const supabase = getSupabaseEdge(env);
    let referralRewardsReconciled = 0;
    try {
      const reconciled = supabase ? await supabase.rpc('reconcile_pending_referrals', { p_limit: 50 }) : null;
      referralRewardsReconciled = reconciled?.error ? 0 : Number(reconciled?.data) || 0;
    } catch (e) {
      console.warn('[cron/recover] Erro ao reconciliar indicações:', e.message);
    }

    // Executa a régua de recuperação de PIX abandonado via Meta Cloud API Oficial
    const recoveryResult = await runAbandonedPixRecovery({ env });

    // Automação de comentários do Instagram, de carona neste agendamento (a cada 15 min) porque o
    // Cloudflare Pages não tem cron próprio. Roda por último e isolada: uma falha aqui nunca pode
    // atrapalhar a recuperação de PIX acima. Com a automação desligada no painel, sai na hora.
    let instagram = null;
    try {
      const r = await executarAutomacao({ env, prazoMs: 20000 });
      instagram = { ok: r.ok, motivo: r.motivo || null, resumo: r.resumo || null };
    } catch (e) {
      console.warn('[cron/recover] Erro na automação do Instagram:', e.message);
    }

    return NextResponse.json({
      success: true,
      referralRewardsReconciled,
      recovery: recoveryResult,
      instagram,
    });
  } catch (err) {
    console.error('[cron/recover] Erro inesperado:', err);
    return NextResponse.json({ error: 'Falha interna do Cron de Recuperação.' }, { status: 500 });
  }
}

export async function GET(req) {
  return handleRecover(req);
}

export async function POST(req) {
  return handleRecover(req);
}
