import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { triggerKaraokeRender } from '@/lib/karaoke';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const { orderId, audioUrl, trackIndex, audioId } = body || {};

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const hasAccess = Boolean(order.hasKaraokeAccess || order.karaokeAddonPaid || order.has_karaoke_access);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Este pedido não possui acesso liberado ao Vídeo Karaokê.' }, { status: 403 });
    }

    const result = await triggerKaraokeRender(orderId, { audioUrl, trackIndex, audioId }, env);
    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Falha ao iniciar geração do karaokê' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Renderização do karaokê iniciada com sucesso.',
      status: result.status,
    });
  } catch (err) {
    console.error('[api/karaoke/generate] Erro:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
