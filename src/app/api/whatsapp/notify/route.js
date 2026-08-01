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
      let customerName = orderData.customerName || 'Cliente';
      let honoreeName = orderData.honoreeName || 'alguém especial';

      const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
      const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;
      const deliveryUrl = `${baseUrl}/entrega?orderId=${orderId}`;
      
      const messageText = `Olá, ${customerName}! 🎵\n\nSua música personalizada para *${honoreeName}* ficou pronta com sucesso no estúdio NSMusic!\n\nForam produzidas 2 versões completas em altíssima qualidade.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nQualquer dúvida, estamos à disposição! ❤️`;

      const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);
      if (sent) {
        await updateDoc(orderRef, {
          whatsappSent: true,
          whatsappSentAt: new Date().toISOString()
        }).catch(e => console.warn("Erro ao atualizar whatsappSent no Firestore:", e));

        console.log(`WhatsApp enviado com sucesso para ${orderData.customerPhone} (Order ${orderId})`);
        return NextResponse.json({ success: true });
      } else {
        console.warn(`Falha ao enviar WhatsApp via W-API para ${orderData.customerPhone}`);
        return NextResponse.json({ error: 'Falha no envio da mensagem via W-API' }, { status: 502 });
      }
    }

    return NextResponse.json({ error: 'Telefone do cliente não cadastrado no pedido' }, { status: 400 });
  } catch (error) {
    console.error("Erro na rota /api/whatsapp/notify:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
