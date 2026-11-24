import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';

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

    // Desde 24/11/2026 o aviso de "música pronta" é adiado (src/lib/avisosAtrasados.js): o cron só
    // manda se o cliente não ouvir a prévia em 15 min. Esta rota fica só para versões antigas da
    // página em cache, que ainda chamam aqui — não envia mais nada na hora.
    return NextResponse.json({
      success: true,
      message: orderData.whatsappSent ? 'WhatsApp já notificado anteriormente.' : 'Aviso adiado.',
    });
  } catch (error) {
    console.error("Erro na rota /api/whatsapp/notify:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
