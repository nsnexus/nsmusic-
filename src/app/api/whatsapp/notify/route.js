import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { sendMusicReadyTemplate } from '@/lib/whatsapp';
import { resolveDeliveryUrl } from '@/lib/whatsappTemplates';

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

    if (orderData.whatsappSent) {
      return NextResponse.json({ success: true, message: 'WhatsApp já notificado anteriormente.' });
    }

    if (!orderData.whatsappRequested) {
      return NextResponse.json({ success: true, message: 'Cliente ainda não iniciou conversa pelo WhatsApp.' });
    }

    if (orderData.customerPhone) {
      const deliveryUrl = resolveDeliveryUrl(orderId);
      const targetPhone = orderData.whatsappSenderPhone || orderData.customerPhone;
      const sendResult = await sendMusicReadyTemplate(targetPhone, {
        customerName: orderData.customerName,
        honoreeName: orderData.honoreeName,
        deliveryUrl,
      });

      if (sendResult.success) {
        await updateOrder(orderId, {
          whatsappSent: true,
          whatsappSentAt: new Date().toISOString()
        }, env).catch(e => console.warn("Erro ao atualizar whatsappSent:", e));

        console.log(`WhatsApp (música pronta) enviado com sucesso — pedido ${orderId}`);
        return NextResponse.json({ success: true });
      } else {
        console.warn(`Falha ao enviar WhatsApp (Cloud API) — pedido ${orderId}`);
        return NextResponse.json({ error: 'Falha no envio da mensagem via WhatsApp' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Telefone do cliente não cadastrado no pedido' }, { status: 400 });
  } catch (error) {
    console.error("Erro na rota /api/whatsapp/notify:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
