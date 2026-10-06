import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getCloudApiConfig } from '@/lib/whatsappCloudApi';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const DEFAULT_WABA_ID = '2160994021495241';
const COST_PER_MSG_BRL = 0.19; // Estimativa média da categoria Utilidade da Meta no Brasil (~US$ 0.035)

/**
 * Consulta a volumetria e custos de mensagens enviadas via WhatsApp Cloud API Oficial.
 * Retorna dados da janela móvel de 24h (para controle de limite de Tier da Meta),
 * do dia corrente e do mês, com estimativa de custos em R$.
 */
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const cloudConfig = getCloudApiConfig(env);
    const token = cloudConfig.token;
    const phoneId = cloudConfig.phoneNumberId || '1266330313237394';
    const wabaId = env.WHATSAPP_WABA_ID || DEFAULT_WABA_ID;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Token da WhatsApp Cloud API não configurado.' },
        { status: 500 }
      );
    }

    const now = Math.floor(Date.now() / 1000);
    const start24h = now - (24 * 3600);

    // Início do dia em horário de Brasília (UTC-3)
    const nowBr = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    nowBr.setHours(0, 0, 0, 0);
    const startToday = Math.floor(nowBr.getTime() / 1000);

    // Início do mês em horário de Brasília
    const startMonthDate = new Date(nowBr.getFullYear(), nowBr.getMonth(), 1, 0, 0, 0);
    const startMonth = Math.floor(startMonthDate.getTime() / 1000);

    let sent24h = 0;
    let delivered24h = 0;
    let sentToday = 0;
    let sentMonth = 0;
    let qualityRating = 'GREEN';
    let status = 'CONNECTED';
    let canSendMessage = 'AVAILABLE';
    let limitTier = 250;
    let displayPhone = '+55 94 8126-2610';

    try {
      // 1. Consulta analítica de mensagens nas últimas 24h e mês na WABA
      const analyticsUrl = `https://graph.facebook.com/v21.0/${wabaId}?fields=analytics.start(${startMonth}).end(${now}).granularity(HALF_HOUR)`;
      const analyticsRes = await fetch(analyticsUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (analyticsRes.ok) {
        const analyticsData = await analyticsRes.json();
        const points = analyticsData.analytics?.data_points || [];

        for (const p of points) {
          const sent = p.sent || 0;
          const delivered = p.delivered || 0;

          if (p.start >= start24h) {
            sent24h += sent;
            delivered24h += delivered;
          }
          if (p.start >= startToday) {
            sentToday += sent;
          }
          if (p.start >= startMonth) {
            sentMonth += sent;
          }
        }
      }
    } catch (err) {
      console.warn('[whatsapp-usage] Falha ao consultar analítico na Meta:', err.message);
    }

    try {
      // 2. Consulta saúde e detalhes do telefone
      const phoneUrl = `https://graph.facebook.com/v21.0/${phoneId}?fields=display_phone_number,quality_rating,status,messaging_limit_tier,health_status`;
      const phoneRes = await fetch(phoneUrl, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });

      if (phoneRes.ok) {
        const phoneData = await phoneRes.json();
        if (phoneData.display_phone_number) displayPhone = phoneData.display_phone_number;
        if (phoneData.quality_rating) qualityRating = phoneData.quality_rating;
        if (phoneData.status) status = phoneData.status;
        if (phoneData.health_status?.can_send_message) canSendMessage = phoneData.health_status.can_send_message;

        // Se a Meta informar o tier de limite
        if (phoneData.messaging_limit_tier) {
          const tierStr = String(phoneData.messaging_limit_tier);
          if (tierStr.includes('TIER_1K') || tierStr.includes('1000')) limitTier = 1000;
          else if (tierStr.includes('TIER_10K') || tierStr.includes('10000')) limitTier = 10000;
          else if (tierStr.includes('TIER_100K')) limitTier = 100000;
          else if (tierStr.includes('TIER_250') || tierStr.includes('250')) limitTier = 250;
        }
      }
    } catch (err) {
      console.warn('[whatsapp-usage] Falha ao consultar detalhes do telefone na Meta:', err.message);
    }

    // Se a consulta da Meta zerou por falha de permissão, fallback seguro via banco Supabase
    if (sent24h === 0 && sentMonth === 0) {
      try {
        const { getSupabaseEdge } = await import('@/lib/supabase-edge');
        const supabase = getSupabaseEdge(env);
        if (supabase) {
          const iso24h = new Date(start24h * 1000).toISOString();
          const isoToday = new Date(startToday * 1000).toISOString();
          const isoMonth = startMonthDate.toISOString();

          const { count: c24h } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .or('ready_template_sent.eq.true,payment_whatsapp_sent.eq.true')
            .gte('created_at', iso24h);

          const { count: cToday } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .or('ready_template_sent.eq.true,payment_whatsapp_sent.eq.true')
            .gte('created_at', isoToday);

          const { count: cMonth } = await supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .or('ready_template_sent.eq.true,payment_whatsapp_sent.eq.true')
            .gte('created_at', isoMonth);

          sent24h = c24h || 0;
          sentToday = cToday || 0;
          sentMonth = cMonth || 0;
        }
      } catch (dbErr) {
        console.warn('[whatsapp-usage] Fallback Supabase falhou:', dbErr.message);
      }
    }

    const remainingLast24h = Math.max(0, limitTier - sent24h);
    const usagePercent = limitTier > 0 ? Math.min(100, Math.round((sent24h / limitTier) * 100)) : 0;
    const isOverLimit = sent24h >= limitTier || canSendMessage === 'LIMITED';
    const isNearLimit = usagePercent >= 80 || isOverLimit;

    return NextResponse.json({
      ok: true,
      sentLast24h: sent24h,
      delivered24h: delivered24h,
      sentToday,
      sentMonth,
      limitTier,
      remainingLast24h,
      usagePercent,
      isNearLimit,
      isOverLimit,
      costPerMessageBrl: COST_PER_MSG_BRL,
      costTodayBrl: Number((sentToday * COST_PER_MSG_BRL).toFixed(2)),
      costLast24hBrl: Number((sent24h * COST_PER_MSG_BRL).toFixed(2)),
      costMonthBrl: Number((sentMonth * COST_PER_MSG_BRL).toFixed(2)),
      qualityRating,
      status,
      canSendMessage,
      displayPhone,
    });
  } catch (error) {
    console.error('[whatsapp-usage] Erro interno:', error);
    return NextResponse.json(
      { ok: false, error: 'Erro ao processar volumetria do WhatsApp', details: error.message },
      { status: 500 }
    );
  }
}
