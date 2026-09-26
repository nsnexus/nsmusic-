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
    const audioUrl = String(body?.audioUrl || '').trim();
    if (!orderId || !audioUrl) {
      return NextResponse.json({ error: 'orderId e audioUrl são obrigatórios' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    if (!order.hasCartaAccess && !order.cartaAddonPaid) {
      return NextResponse.json({ error: 'Este pedido não tem a Carta paga' }, { status: 403 });
    }

    const faixasValidas = [order.audioUrl, ...(Array.isArray(order.audioFiles) ? order.audioFiles : [])].filter(Boolean);
    if (!faixasValidas.includes(audioUrl)) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    await updateOrder(orderId, { cartaMusicaUrl: audioUrl, updatedAt: new Date().toISOString() }, env);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[carta/choose-music] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a música escolhida' }, { status: 500 });
  }
}
