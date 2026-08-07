import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendMusicReadyTemplate } from '@/lib/whatsapp';
import { resolveDeliveryUrl } from '@/lib/whatsappTemplates';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const orderData = orderSnap.data();

    // Se já foi enviado o WhatsApp para este pedido, ignora
    if (orderData.whatsappSent) {
      return NextResponse.json({ success: true, message: 'WhatsApp já notificado anteriormente.' });
    }

    if (orderData.customerPhone) {
      const deliveryUrl = resolveDeliveryUrl(orderId);
      const sendResult = await sendMusicReadyTemplate(orderData.customerPhone, {
        customerName: orderData.customerName,
        honoreeName: orderData.honoreeName,
        deliveryUrl,
      });

      if (sendResult.success) {
        await updateDoc(orderRef, {
          whatsappSent: true,
          whatsappSentAt: new Date().toISOString()
        }).catch(e => console.warn("Erro ao atualizar whatsappSent no Firestore:", e));

        // Nunca logar telefone/e-mail do cliente (ver M-25 no AUDIT_REPORT.md).
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
