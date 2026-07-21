import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendWhatsAppMessage } from '@/lib/whatsapp';

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
      const name = orderData.customerName || 'Cliente';
      const honoree = orderData.honoreeName || 'alguém especial';
      const deliveryUrl = `https://nsmusic.vercel.app/entrega?orderId=${orderId}`;
      
      const messageText = `Olá, ${name}! 🎵\n\nSua música personalizada para *${honoree}* ficou pronta com sucesso no estúdio NSMusic!\n\nForam produzidas 2 versões completas em altíssima qualidade.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nQualquer dúvida, estamos à disposição! ❤️`;

      const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);
      if (sent) {
        await updateDoc(orderRef, { whatsappSent: true, whatsappSentAt: new Date().toISOString() });
        console.log(`WhatsApp enviado com sucesso para ${orderData.customerPhone} (Order ${orderId})`);
        return NextResponse.json({ success: true });
      } else {
        console.warn(`Falha ao enviar WhatsApp via Evolution API para ${orderData.customerPhone}`);
        return NextResponse.json({ error: 'Falha no envio do WhatsApp' }, { status: 500 });
      }
    }

    return NextResponse.json({ error: 'Telefone do cliente não cadastrado no pedido' }, { status: 400 });
  } catch (error) {
    console.error("Erro na rota /api/whatsapp/notify:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
