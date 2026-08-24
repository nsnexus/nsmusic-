import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWApiTextMessage, resolveDeliveryUrl } from '@/lib/whatsapp';

export const runtime = 'edge';

// GET para verificação se necessário
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge');
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ status: 'ok', service: 'NSMusic WhatsApp Webhook' });
}

// Extrai o número do telefone de forma limpa (somente dígitos)
function extractPhoneDigits(val) {
  return String(val || '').replace(/\D/g, '');
}

export async function POST(req) {
  let envVars = process.env;
  try {
    if (getRequestContext()?.env) envVars = getRequestContext().env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    console.log('[WhatsApp Webhook] Mensagem recebida no Webhook');

    // Suporta múltiplos formatos de webhook (W-API, Meta Cloud API, etc.)
    let senderPhone = '';
    let messageText = '';

    // Formato W-API padrão: { phone, message, ... } ou { data: { phone, message, ... } }
    if (body.phone) {
      senderPhone = body.phone;
      messageText = body.message || body.text || body.body || '';
    } else if (body.data?.phone) {
      senderPhone = body.data.phone;
      messageText = body.data.message || body.data.text || body.data.body || '';
    } else if (body.from) {
      senderPhone = body.from;
      messageText = body.message || body.text || body.body || '';
    } else if (body.entry) {
      // Formato Meta Cloud API
      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        for (const change of entry?.changes || []) {
          const msg = change?.value?.messages?.[0];
          if (msg?.from) {
            senderPhone = msg.from;
            messageText = msg.text?.body || '';
          }
        }
      }
    }

    senderPhone = extractPhoneDigits(senderPhone);

    if (!senderPhone || senderPhone.length < 8) {
      return NextResponse.json({ success: true, warning: 'Nenhum remetente identificado' }, { status: 200 });
    }

    // Procura por ID de pedido ou número de pedido no texto da mensagem
    let matchedOrder = null;
    let matchedOrderId = '';

    // 1. Tentar encontrar ID de pedido no texto (ex: id=abc12345 ou pedido abc12345)
    const idMatch = messageText.match(/(?:id=|pedido[:\s]+|#)([a-zA-Z0-9_-]{6,30})/i);
    if (idMatch && idMatch[1]) {
      const candidateId = idMatch[1].trim();
      try {
        const snap = await getDocs(query(collection(db, 'orders'), where('__name__', '==', candidateId)));
        if (!snap.empty) {
          matchedOrderId = snap.docs[0].id;
          matchedOrder = snap.docs[0].data();
        }
      } catch (e) {}
    }

    // 2. Se não encontrou por ID explícito, busca os pedidos mais recentes pelo telefone do cliente
    if (!matchedOrder) {
      const phoneDigits = senderPhone.slice(-8); // últimos 8 dígitos para cobrir variações de DDD/9º dígito
      try {
        const ordersRef = collection(db, 'orders');
        const snap = await getDocs(ordersRef);
        
        let foundDocs = [];
        snap.forEach((d) => {
          const data = d.data();
          const orderPhoneDigits = extractPhoneDigits(data.customerPhone);
          if (orderPhoneDigits && orderPhoneDigits.endsWith(phoneDigits)) {
            foundDocs.push({ id: d.id, data, createdAt: data.createdAt || '' });
          }
        });

        if (foundDocs.length > 0) {
          // Ordena pelo mais recente
          foundDocs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          matchedOrderId = foundDocs[0].id;
          matchedOrder = foundDocs[0].data;
        }
      } catch (err) {
        console.warn('[WhatsApp Webhook] Erro ao buscar pedido por telefone:', err.message);
      }
    }

    // Se encontrou o pedido do cliente:
    if (matchedOrder && matchedOrderId) {
      const customerName = matchedOrder.customerName || 'Cliente';
      const honoreeName = matchedOrder.honoreeName || 'alguém especial';
      const deliveryUrl = resolveDeliveryUrl(matchedOrderId);

      // Marca que o cliente solicitou o envio pelo WhatsApp
      try {
        await updateDoc(doc(db, 'orders', matchedOrderId), {
          whatsappRequested: true,
          whatsappSenderPhone: senderPhone,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}

      // Se a música já estiver pronta:
      if (matchedOrder.audioUrl || matchedOrder.audioFiles?.length) {
        const replyMsg = `🎵 *Olá, ${customerName}!*

A sua música personalizada para *${honoreeName}* já está pronta com 2 arranjos exclusivos! 🎧

👉 *Ouça as prévias e baixe seus arquivos em alta qualidade no link:*
${deliveryUrl}

Se precisar de qualquer ajuda para concluir seu pedido, basta responder aqui! 💜`;

        await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        return NextResponse.json({ success: true, action: 'sent_ready_link' }, { status: 200 });
      } else {
        // A música ainda está sendo gerada pela IA:
        const replyMsg = `⏳ *Olá, ${customerName}!*

Recebemos seu pedido com sucesso! Nosso estúdio está finalizando as 2 versões da música para *${honoreeName}*. 🎶

Assim que a renderização terminar (leva cerca de 1 a 2 minutos), enviaremos o link direto aqui nesta conversa! 💜`;

        await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        return NextResponse.json({ success: true, action: 'sent_wait_acknowledgment' }, { status: 200 });
      }
    }

    // Mensagem de boas-vindas/atendimento geral caso não seja identificado pedido específico
    const generalReply = `Olá! Seja muito bem-vindo ao suporte do *NS Music* 🎵

Se você acabou de criar uma música, você pode acessar ou acompanhar seu pedido diretamente no site:
👉 https://nsmusic.nsnexus.com.br/acompanhar

Como podemos te ajudar hoje? 💜`;

    await sendWApiTextMessage(senderPhone, generalReply, envVars);
    return NextResponse.json({ success: true, action: 'sent_general_reply' }, { status: 200 });

  } catch (err) {
    console.error('[WhatsApp Webhook] Erro geral:', err.message);
    return NextResponse.json({ success: true, error: err.message }, { status: 200 });
  }
}
