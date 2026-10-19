import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { notifyMusicReady } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const orderData = await getOrder(orderId, env);
    if (!orderData) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const result = await notifyMusicReady(orderId, orderData, orderId, {}, env);
    if (result.sent) {
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({
      success: true,
      message: result.reason === 'already_sent' ? 'WhatsApp já notificado anteriormente.' : (result.reason || 'Envio ignorado.')
    });
  } catch (error) {
    console.error("Erro na rota /api/whatsapp/notify:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
