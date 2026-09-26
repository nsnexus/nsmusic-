import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const audioId = String(body?.audioId || '').trim();
    if (!orderId || !audioId) {
      return NextResponse.json({ error: 'orderId e audioId são obrigatórios' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    if (!Array.isArray(order.audioIds) || !order.audioIds.includes(audioId)) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    await updateOrder(orderId, { playbackChosenAudioId: audioId, updatedAt: new Date().toISOString() }, env);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[playback/choose-track] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a faixa escolhida' }, { status: 500 });
  }
}
