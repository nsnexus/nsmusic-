import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWApiTextMessage, resolveDeliveryUrl, isVideoPurchased } from '@/lib/whatsapp';
import { handleWhatsAppAgentMessage, pauseAgentForPhone, resumeAgentForPhone } from '@/lib/whatsappAgent';
import { findRecentOrderByPhone, isNewSongIntent } from '@/lib/orderLookup';
import { extractAudioFromWebhook, transcribeAudioWithFailover } from '@/lib/transcribeAudio';

export const runtime = 'edge';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge');
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return NextResponse.json({ status: 'ok', service: 'NSMusic WhatsApp Webhook' });
}

function normalizeWebhookBody(rawBody) {
  let body = rawBody;
  if (!body) return {};
  if (Array.isArray(body) && body.length > 0) {
    body = body[0];
  }
  if (Array.isArray(body?.data) && body.data.length > 0) {
    body = { ...body, data: body.data[0] };
  }
  if (Array.isArray(body?.data?.messages) && body.data.messages.length > 0) {
    body = { ...body, data: body.data.messages[0] };
  }
  if (Array.isArray(body?.messages) && body.messages.length > 0) {
    body = { ...body, data: body.messages[0] };
  }
  return body;
}

function extractMessageText(body) {
  if (!body) return '';
  if (typeof body === 'string') return body;

  const candidates = [
    // Formato real da W-API (confirmado em produção 24/08/2026): texto vem em msgContent.conversation,
    // não em data.message.conversation como os candidatos abaixo assumiam — payload inteiro é
    // top-level (event, instanceId, chat, sender, msgContent), sem wrapper "data".
    body.msgContent?.conversation,
    body.msgContent?.extendedTextMessage?.text,
    body.msgContent?.imageMessage?.caption,
    body.msgContent?.videoMessage?.caption,
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
    body.data?.message?.imageMessage?.caption,
    body.data?.message?.videoMessage?.caption,
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
    // Formato real da W-API — sender é um objeto ({ id, senderLid, pushName, ... }), não uma string;
    // o número puro fica em sender.id (senderLid/chat.id usam o formato novo "@lid" da Meta, que não
    // é o telefone). body.sender sozinho (candidato abaixo) vira "[object Object]" e é descartado.
    body.sender?.id,
    body.phone,
    body.from,
    body.sender,
    body.data?.phone,
    body.data?.from,
    body.data?.sender,
    body.data?.key?.remoteJid,
    body.data?.key?.participant,
    body.key?.remoteJid,
    body.key?.participant,
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

const processedMessageIds = new Map();
const activePhoneLocks = new Map();

function isIgnoredEvent(body) {
  if (!body) return false;
  const eventName = String(body.event || body.type || body.data?.event || '').toLowerCase().trim();
  const ignoredEvents = [
    'chat-presence',
    'presence',
    'presence.update',
    'message-status',
    'status',
    'messages.update',
    'message.update',
    'connected',
    'disconnected',
    'connection.update',
    'group-participants-update',
    'groups.upsert',
  ];
  if (ignoredEvents.includes(eventName)) return true;

  // Se o payload indicar evento de status (ex: status: "DELIVERY_ACK", "READ", "SENT") sem texto nem áudio
  if (body.status || body.data?.status || body.presence || body.data?.presence) {
    if (!body.msgContent && !body.message && !body.data?.message && !body.data?.conversation) {
      return true;
    }
  }
  return false;
}

function extractMessageId(body) {
  if (!body) return '';
  const candidates = [
    body.msgId,
    body.messageId,
    body.id,
    body.key?.id,
    body.data?.key?.id,
    body.data?.id,
    body.msg?.id,
    body.data?.msg?.id,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string' && c.trim()) return c.trim();
  }
  return '';
}

function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  const now = Date.now();
  for (const [id, time] of processedMessageIds.entries()) {
    if (now - time > 120000) processedMessageIds.delete(id);
  }
  if (processedMessageIds.has(msgId)) return true;
  processedMessageIds.set(msgId, now);
  return false;
}

function isPhoneLocked(phone) {
  if (!phone) return false;
  const now = Date.now();
  const lastTime = activePhoneLocks.get(phone);
  if (lastTime && now - lastTime < 3000) {
    return true;
  }
  activePhoneLocks.set(phone, now);
  return false;
}

export async function POST(req) {
  let envVars = process.env;
  try {
    if (getRequestContext()?.env) envVars = getRequestContext().env;
  } catch (e) {}

  try {
    let rawBody = {};
    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      rawBody = await req.json().catch(() => ({}));
    } else if (contentType.includes('form') || contentType.includes('urlencoded')) {
      const formData = await req.formData().catch(() => null);
      if (formData) {
        rawBody = Object.fromEntries(formData.entries());
      }
    } else {
      const text = await req.text().catch(() => '');
      try {
        rawBody = JSON.parse(text);
      } catch (e) {
        rawBody = { message: text };
      }
    }

    const body = normalizeWebhookBody(rawBody);

    // 1. Ignora eventos que não são de mensagens reais (presença, status de entrega/leitura, conexão)
    if (isIgnoredEvent(body)) {
      return NextResponse.json({ success: true, ignored: 'non_message_event' }, { status: 200 });
    }

    // 2. Deduplicação por ID da mensagem (evita processamento duplicado de retries do webhook)
    const messageId = extractMessageId(body);
    if (messageId && isDuplicateMessage(messageId)) {
      console.log(`[WhatsApp Webhook] Mensagem duplicada ignorada (ID: ${messageId})`);
      return NextResponse.json({ success: true, ignored: 'duplicate_message_id' }, { status: 200 });
    }

    const senderPhone = extractSenderPhone(body);
    let messageText = extractMessageText(body);

    // Se o cliente enviou um áudio, transcreve com OpenAI Whisper / Gemini
    const audioSource = extractAudioFromWebhook(body);
    if (audioSource && !messageText) {
      console.log('[WhatsApp Webhook] Áudio detectado no webhook. Iniciando transcrição...');
      try {
        const transcribedText = await transcribeAudioWithFailover(audioSource, envVars);
        if (transcribedText) {
          messageText = transcribedText;
          console.log('[WhatsApp Webhook] Áudio transcrito com sucesso:', messageText);
        }
      } catch (err) {
        console.warn('[WhatsApp Webhook] Erro ao transcrever áudio:', err.message);
      }
    }

    // 3. Ignora eventos sem nenhum conteúdo de texto ou áudio
    if (!messageText && !audioSource) {
      return NextResponse.json({ success: true, ignored: 'empty_content' }, { status: 200 });
    }

    console.log(`[WhatsApp Webhook] De: ${senderPhone || 'Desconhecido'} | Texto: "${messageText || ''}" | Audio: ${Boolean(audioSource)}`);

    // 4. Trava de concorrência por telefone (evita disparos paralelos dentro de 3 segundos para o mesmo número)
    if (senderPhone && isPhoneLocked(senderPhone)) {
      console.log(`[WhatsApp Webhook] Processamento concorrente descartado para: ${senderPhone}`);
      return NextResponse.json({ success: true, ignored: 'concurrent_lock' }, { status: 200 });
    }

    // Quando a mensagem foi enviada por nós mesmos (fromMe: true), detectamos intervenção humana
    if (body.fromMe === true || body.data?.key?.fromMe === true || body.key?.fromMe === true) {
      if (senderPhone) {
        const lower = (messageText || '').toLowerCase();
        // Se o atendente humano enviou comando explícito para reativar o bot:
        if (lower.includes('#ia') || lower.includes('#bot') || lower.includes('#ligar')) {
          await resumeAgentForPhone(senderPhone);
          return NextResponse.json({ success: true, action: 'agent_resumed_by_human' }, { status: 200 });
        }

        // Caso contrário, qualquer mensagem enviada manualmente pelo WhatsApp pausa a IA automaticamente para este cliente:
        await pauseAgentForPhone(senderPhone);
      }
      return NextResponse.json({ success: true, ignored: 'from_me_human_takeover' }, { status: 200 });
    }

    if (!senderPhone || senderPhone.length < 8) {
      return NextResponse.json({ success: true, warning: 'Nenhum remetente identificado' }, { status: 200 });
    }

    // 1. Tentar encontrar ID de pedido no texto (ex: id=abc12345 ou pedido abc12345)
    let matchedOrder = null;
    let matchedOrderId = '';

    const idMatch = (messageText || '').match(/(?:id=|pedido[:\s]+|#)([a-zA-Z0-9_-]{6,30})/i);
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

    // Se NÃO passou ID explícito e NÃO é intenção explícita de criar nova música,
    // verifica se o telefone do cliente já possui algum pedido realizado no sistema:
    if (!matchedOrder && senderPhone && !isNewSongIntent(messageText)) {
      try {
        const existingOrder = await findRecentOrderByPhone(senderPhone);
        if (existingOrder) {
          matchedOrderId = existingOrder.id;
          matchedOrder = existingOrder;
          console.log(`[WhatsApp Webhook] Pedido existente localizado para o telefone ${senderPhone}: #${existingOrder.orderNumber || existingOrder.id}`);
        }
      } catch (lookupErr) {
        console.warn('[WhatsApp Webhook] Erro ao buscar pedido por telefone:', lookupErr.message);
      }
    }

    // Se encontrou o pedido do cliente (por ID ou pelo telefone):
    if (matchedOrder && matchedOrderId) {
      const customerName = matchedOrder.customerName || 'Cliente';
      const honoreeName = matchedOrder.honoreeName || 'alguém especial';
      const orderNum = matchedOrder.orderNumber ? `#${matchedOrder.orderNumber}` : '';
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
        const isPaid = matchedOrder.paymentStatus === 'PAGAMENTO_APROVADO' || matchedOrder.paymentStatus === 'PAGO';
        const urls = (matchedOrder.audioFiles?.length ? matchedOrder.audioFiles : [matchedOrder.audioUrl]).filter(Boolean);
        const audiosList = urls.map((link, idx) => `• *Versão ${idx + 1}:* ${link}`).join('\n');

        let replyMsg = '';
        if (isPaid) {
          const userHasVideo = isVideoPurchased(matchedOrder);
          const videoBlock = userHasVideo
            ? `━━━━━━━━━━━━━━━━━━━━\n🎬 Seu *vídeo homenagem* também já está liberado! Pra gerar, é só enviar de 10 a 20 fotos na sua página de entrega (mesmo link acima) que a gente sincroniza tudo com a música. 📸\n━━━━━━━━━━━━━━━━━━━━\n\n`
            : `━━━━━━━━━━━━━━━━━━━━\n🎬 *QUE TAL UM VÍDEO HOMENAGEM?*\nTransforme essa música linda em um *vídeo com fotos e legendas sincronizadas* para emocionar ainda mais ${honoreeName}!\n\n✨ *Adicione o vídeo ao seu pedido por apenas R$ 6,90:*\n${deliveryUrl}\n━━━━━━━━━━━━━━━━━━━━\n\n`;

          replyMsg = `🎉 *PAGAMENTO CONFIRMADO!*

Olá, ${customerName}! Localizei seu pedido ${orderNum ? `*(${orderNum})* ` : ''}para *${honoreeName}*! 🎶

As músicas personalizadas já estão 100% liberadas em alta definição (MP3 HD):

${audiosList ? `📥 *Baixe seus áudios diretamente:*\n${audiosList}\n\n` : ''}🔗 *Acesse sua página de entrega permanente:*
${deliveryUrl}

${videoBlock}───────────────────
💬 *Precisa de ajuda ou suporte com este pedido?* Nossa equipe humana já vai te atender aqui!
🎵 *Quer criar uma NOVA música para outra pessoa?* Basta responder *NOVO PEDIDO*.`;
        } else {
          replyMsg = `🎵 *Olá, ${customerName}!*

Localizei seu pedido ${orderNum ? `*(${orderNum})* ` : ''}para *${honoreeName}*! 🎧

A sua música personalizada já foi produzida com sucesso no estúdio *NS Music*. Foram gravadas 2 versões exclusivas com arranjos diferentes para você escolher.

👉 *Ouça a prévia e libere seus arquivos aqui:*
${deliveryUrl}

───────────────────
💬 *Precisa de suporte ou ajuda com o pagamento?* Nossa equipe humana já vai te atender por aqui!
🎵 *Quer criar uma NOVA música do zero?* Basta responder *NOVO PEDIDO*.`;
        }

        await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        return NextResponse.json({ success: true, action: 'sent_ready_link' }, { status: 200 });
      } else {
        // A música ainda está sendo gerada pela IA:
        const replyMsg = `⏳ *Olá, ${customerName}!*

Localizei seu pedido ${orderNum ? `*(${orderNum})* ` : ''}para *${honoreeName}*! 🎧

Nosso estúdio está finalizando a gravação das 2 versões da música neste momento (leva de 1 a 2 minutinhos).

Assim que a renderização terminar, eu te envio os arquivos e o link direto aqui nesta conversa! 💜

───────────────────
💬 *Precisa de suporte?* Nossa equipe humana já vai te responder!`;

        await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        return NextResponse.json({ success: true, action: 'sent_wait_acknowledgment' }, { status: 200 });
      }
    }

    // 2. Se NÃO é um pedido por ID, passa para o Agente Conversacional de Criação de Música no WhatsApp
    try {
      const agentHandled = await handleWhatsAppAgentMessage(senderPhone, messageText, envVars);
      if (agentHandled) {
        return NextResponse.json({ success: true, action: 'agent_handled' }, { status: 200 });
      }
    } catch (agentErr) {
      console.error('[WhatsApp Webhook] Erro no Agente:', agentErr.message, agentErr.stack);
      return NextResponse.json({ success: true, error: `agent_error: ${agentErr.message}` }, { status: 200 });
    }

    // 3. Se não for gatilho de atendimento nem houver sessão ativa, ignora silenciosamente para não atrapalhar conversas pessoais
    return NextResponse.json({ success: true, ignored: 'regular_conversation' }, { status: 200 });

  } catch (err) {
    console.error('[WhatsApp Webhook] Erro geral:', err.message, err.stack);
    return NextResponse.json({ success: true, error: `general_error: ${err.message}` }, { status: 200 });
  }
}
