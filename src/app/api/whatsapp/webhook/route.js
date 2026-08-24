import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWApiTextMessage, resolveDeliveryUrl } from '@/lib/whatsapp';

export const runtime = 'edge';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge');
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  // Permite consultar os últimos webhooks recebidos em tempo real para diagnóstico
  if (searchParams.get('logs') === 'true') {
    try {
      const snap = await getDocs(collection(db, 'whatsapp_webhook_logs'));
      const logs = [];
      snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
      logs.sort((a, b) => new Date(b.receivedAt || 0).getTime() - new Date(a.receivedAt || 0).getTime());
      return NextResponse.json({ logs: logs.slice(0, 15) });
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  }

  return NextResponse.json({ status: 'ok', service: 'NSMusic WhatsApp Webhook' });
}

function extractMessageText(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;

  const candidates = [
    body.message,
    body.text,
    body.body,
    body.msg?.body,
    body.msg?.text,
    body.data?.message,
    body.data?.text,
    body.data?.body,
    body.data?.msg?.body,
    body.data?.msg?.text,
    body.data?.conversation,
    body.data?.message?.conversation,
    body.data?.message?.extendedTextMessage?.text,
    body.message?.conversation,
    body.message?.extendedTextMessage?.text,
  ];

  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }

  return '';
}

function extractSenderPhone(body) {
  if (!body) return '';
  const candidates = [
    body.phone,
    body.from,
    body.sender,
    body.data?.phone,
    body.data?.from,
    body.data?.sender,
    body.data?.key?.remoteJid,
    body.key?.remoteJid,
    body.chatId,
    body.data?.chatId,
  ];

  for (let raw of candidates) {
    if (raw) {
      raw = String(raw);
      if (raw.includes('@')) raw = raw.split('@')[0];
      const digits = raw.replace(/\D/g, '');
      if (digits.length >= 8) return digits;
    }
  }

  // Fallback Meta Cloud API entry
  const entries = Array.isArray(body.entry) ? body.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const msg = change?.value?.messages?.[0];
      if (msg?.from) return String(msg.from).replace(/\D/g, '');
    }
  }

  return '';
}

export async function POST(req) {
  let envVars = process.env;
  try {
    if (getRequestContext()?.env) envVars = getRequestContext().env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    console.log('[WhatsApp Webhook] Mensagem recebida no Webhook');

    const senderPhone = extractSenderPhone(body);
    const messageText = extractMessageText(body);

    // Grava log para auditoria e diagnóstico em tempo real
    try {
      const logId = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await setDoc(doc(db, 'whatsapp_webhook_logs', logId), {
        receivedAt: new Date().toISOString(),
        rawBody: JSON.stringify(body).slice(0, 2500),
        senderPhone: senderPhone || null,
        messageText: messageText || null,
      });
    } catch (logErr) {
      console.warn('[Webhook Log] Erro ao gravar log:', logErr.message);
    }

    // Ignora mensagens enviadas por nós mesmos (fromMe: true)
    if (body.fromMe === true || body.data?.key?.fromMe === true || body.key?.fromMe === true) {
      return NextResponse.json({ success: true, ignored: 'from_me' }, { status: 200 });
    }

    if (!senderPhone || senderPhone.length < 8) {
      return NextResponse.json({ success: true, warning: 'Nenhum remetente identificado' }, { status: 200 });
    }

    let matchedOrder = null;
    let matchedOrderId = '';

    // 1. Tentar encontrar ID de pedido no texto (ex: id=abc12345 ou pedido abc12345)
    const idMatch = messageText.match(/(?:id=|pedido[:\s]+|#)([a-zA-Z0-9_-]{6,30})/i);
    if (idMatch && idMatch[1]) {
      const candidateId = idMatch[1].trim();
      try {
        const snap = await getDoc(doc(db, 'orders', candidateId));
        if (snap.exists()) {
          matchedOrderId = snap.id;
          matchedOrder = snap.data();
        }
      } catch (e) {
        console.warn('[WhatsApp Webhook] Erro ao buscar pedido por ID:', e.message);
      }
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
          const orderPhoneDigits = String(data.customerPhone || '').replace(/\D/g, '');
          if (orderPhoneDigits && orderPhoneDigits.endsWith(phoneDigits)) {
            foundDocs.push({ id: d.id, data, createdAt: data.createdAt || '' });
          }
        });

        if (foundDocs.length > 0) {
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
