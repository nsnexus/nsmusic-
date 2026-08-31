import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWApiTextMessage, resolveDeliveryUrl, isVideoPurchased } from '@/lib/whatsapp';
import { handleWhatsAppAgentMessage, pauseAgentForPhone, resumeAgentForPhone } from '@/lib/whatsappAgent';
import { findRecentOrderByPhone, isNewSongIntent, findOrderByIdOrNumber, isShortAckMessage } from '@/lib/orderLookup';
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

function extractCandidateOrderId(text) {
  if (!text) return '';
  const str = String(text);

  // 1. Padrão orderNumber (ex: NS-xxxx-xxxx-2026 ou NS-xxxx...)
  const nsMatch = str.match(/\b(NS-[A-Z0-9-]+)\b/i);
  if (nsMatch && nsMatch[1]) {
    return nsMatch[1].trim();
  }

  // 2. Padrão com prefixo explícito (ex: id=abc12345, id: abc12345, pedido: abc12345, pedido #abc12345, #abc12345)
  const prefixMatch = str.match(/(?:id\s*[:=]\s*|pedido\s*[:=]?\s*#?|#)([a-zA-Z0-9_-]{6,30})/i);
  if (prefixMatch && prefixMatch[1]) {
    return prefixMatch[1].trim();
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

  const candidateNames = [
    'sender.id', 'phone', 'from', 'sender', 'data.phone', 'data.from', 'data.sender',
    'data.key.remoteJid', 'data.key.participant', 'key.remoteJid', 'key.participant',
    'chatId', 'data.chatId',
  ];

  // Varre TODOS os candidatos (não para no primeiro) e prefere um de formato BR válido (12 ou 13
  // dígitos com código do país) — achado 27/08/2026: o candidato de maior prioridade (`sender.id`)
  // às vezes vem como LID (identificador de privacidade do WhatsApp/Meta) em vez do telefone real,
  // mesmo esse sendo, pra ESSE contato, o campo certo pra outros clientes. Preferir o primeiro de
  // formato válido entre TODOS os candidatos resolve o caso em que o telefone de verdade está num
  // campo mais abaixo na lista — sem precisar saber de antemão qual campo é. Nunca regride o caso
  // comum: quando o primeiro candidato já é válido, o resultado é idêntico ao comportamento anterior.
  //
  // Achado 28/08/2026, mais importante: quando NENHUM candidato é um telefone real (só existe LID —
  // acontece de verdade, é impossível converter LID pra telefone, decisão de privacidade da própria
  // Meta), o código antigo devolvia só os dígitos do LID, sem o sufixo "@lid". A W-API (e provedores
  // similares) SÓ entrega mensagem a um LID se o sufixo "@lid" for mantido no envio — dígito solto
  // não é um telefone válido, a API aceita a chamada (200) mas a mensagem não chega em lugar nenhum.
  // Por isso agora, quando o candidato vem com sufixo "@lid" explícito no payload OU tem formato que
  // não bate com telefone BR (a maior parte dos casos reais, já que a W-API costuma entregar sender.id
  // já sem o domínio), o valor final é reconstruído como "<dígitos>@lid" — ver formatToWhatsAppNumber
  // em src/lib/whatsappTemplates.js, que agora repassa esse formato sem tentar "consertar" como se
  // fosse número de celular.
  let firstValid = null;
  let firstValidName = '';
  let firstValidIsLid = false;
  let preferredValid = null;
  let preferredValidName = '';

  for (let i = 0; i < candidates.length; i++) {
    let raw = candidates[i];
    if (!raw) continue;
    raw = String(raw);

    let explicitLid = false;
    if (raw.includes('@')) {
      const domain = raw.split('@')[1] || '';
      explicitLid = domain === 'lid';
      raw = raw.split('@')[0];
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8) continue;

    // BR válido (código do país + DDD) é sempre 12 ou 13 dígitos — fora disso, mesmo sem sufixo
    // "@lid" explícito no payload, é (na prática observada) um LID que a W-API já entregou sem o
    // domínio. Tratar como LID também nesse caso é o que garante a reconstrução do "@lid" abaixo.
    const isLid = explicitLid || (digits.length !== 12 && digits.length !== 13);

    if (firstValid === null) {
      firstValid = digits;
      firstValidName = candidateNames[i];
      firstValidIsLid = isLid;
    }
    if (preferredValid === null && !isLid) {
      preferredValid = digits;
      preferredValidName = candidateNames[i];
    }
  }

  if (preferredValid) {
    if (firstValidName && firstValidName !== preferredValidName) {
      // O primeiro candidato da lista não era o de formato válido — provavelmente era um LID e essa
      // troca é o que evitou mandar mensagem pro identificador errado. Log só de nomes, sem telefone.
      console.log(`[WhatsApp Webhook] Telefone: candidato "${firstValidName}" não tinha formato BR válido, usado "${preferredValidName}" em vez dele.`);
    }
    return preferredValid;
  }

  if (firstValid) {
    // Nenhum candidato é telefone real — só LID em todos os campos conhecidos. Reconstrói o sufixo
    // "@lid" pra mensagem conseguir ser entregue (ver comentário acima). Nunca logar o valor em si
    // (telefone é PII) — só a forma, útil se aparecer um formato ainda não coberto.
    if (firstValidIsLid) {
      console.log(`[WhatsApp Webhook] Telefone é LID (candidato "${firstValidName}", ${firstValid.length} dígitos) — enviando com sufixo @lid.`);
      return `${firstValid}@lid`;
    }
    return firstValid;
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

// Dedup/trava de concorrência via Firestore, não Map em memória — achado 27/08/2026: Cloudflare
// Edge Functions não garantem a mesma instância entre requisições, então um `Map` module-level só
// protegia retentativas da W-API que caíssem, por acaso, na mesma instância. Quando caíam em
// instâncias diferentes (comum), a trava nunca via a primeira chamada e o cliente recebia a
// mensagem duplicada. Sem `runTransaction` no SDK `firestore/lite` do Edge (mesma limitação já
// documentada em src/lib/payments.js) — getDoc+setDoc sequencial ainda deixa uma janela mínima em
// concorrência bem apertada, mas fecha o caso comum (retentativa chegando alguns segundos depois),
// que é o que estava realmente acontecendo.
const DEDUP_COLLECTION = 'whatsapp_dedup';
const MESSAGE_DEDUP_WINDOW_MS = 120000;
// 10s, não 3s (achado 27/08/2026) — a etapa de coleta do agente (src/lib/whatsappAgent.js) faz
// sleep(3500) + chamada de LLM antes de salvar a sessão; 3s era menor que essa janela de
// processamento, então uma segunda mensagem do cliente enviada logo em seguida (comum em WhatsApp)
// lia a sessão ANTES da primeira salvar e sobrescrevia campo já respondido ao terminar depois dela.
// Trade-off aceito: com a trava maior, 2 mensagens rápidas e DIFERENTES do mesmo cliente dentro da
// janela — a segunda é descartada silenciosa em vez de processada. Preferível a perder dado de
// sessão; ver análise completa no histórico da sessão de 27/08/2026.
const PHONE_LOCK_WINDOW_MS = 10000;

// Janela em que NÃO se repete um template que o cliente acabou de receber, mesmo que ele mande de
// novo uma mensagem com o ID do pedido (achado 28/08/2026: cliente recebendo a mensagem de espera
// duplicada). O botão do site abre o WhatsApp com o texto "…do meu pedido id=XXXX" já preenchido,
// então TODA mensagem vinda dali tem ID explícito — e a checagem de "já enviei" era pulada
// justamente nesse caso, que é o mais comum de todos. Dedup por messageId e trava por telefone não
// cobrem isso: são mensagens distintas, com ids distintos, às vezes com minutos de intervalo.
// Passada a janela, o reenvio volta a ser permitido — cliente que volta mais tarde querendo o link
// de novo continua sendo atendido.
const TEMPLATE_RESEND_COOLDOWN_MS = 10 * 60 * 1000;

function sentWithinCooldown(sentAtIso) {
  if (!sentAtIso) return false;
  const ts = Date.parse(sentAtIso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < TEMPLATE_RESEND_COOLDOWN_MS;
}

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

  // Removido o filtro heurístico de "status/presence sem texto" que existia aqui: ele só reconhecia
  // texto em 4 campos (msgContent/message/data.message/data.conversation), bem menos que os que
  // extractMessageText de fato verifica (body.text, body.body, body.data.msg.body etc.) — mensagem
  // real que carregasse qualquer campo genérico `status`/`presence` junto (comum em payload
  // combinado com metadado de entrega) e tivesse o texto num desses campos não cobertos morria aqui,
  // silenciosa, antes de qualquer lógica de pedido rodar (achado 26/08/2026: cliente pagou e nunca
  // recebeu nem a confirmação, porque whatsappRequested nunca chegou a ser gravado). O filtro
  // definitivo e completo já existe mais abaixo (`if (!messageText && !audioSource)`), que só
  // descarta depois de checar de verdade todos os campos — esse aqui era redundante e mais arriscado.
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

// messageId da própria W-API pode ter caracteres fora do permitido em ID de documento Firestore
// (barra, por exemplo) — sanitiza pra nunca quebrar o doc(...) por causa disso.
function sanitizeDedupKey(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

async function isDuplicateMessage(msgId) {
  if (!msgId) return false;
  const ref = doc(db, DEDUP_COLLECTION, `msg_${sanitizeDedupKey(msgId)}`);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const at = Date.parse(snap.data()?.at || '');
      if (!Number.isNaN(at) && Date.now() - at < MESSAGE_DEDUP_WINDOW_MS) return true;
    }
    await setDoc(ref, { at: new Date().toISOString() });
    return false;
  } catch (err) {
    // Falha ao consultar/gravar a trava nunca pode travar a mensagem — melhor arriscar duplicata
    // (que já era o comportamento de hoje) do que silenciar cliente por um erro do Firestore.
    console.warn('[WhatsApp Webhook] Erro na deduplicação por Firestore:', err.message);
    return false;
  }
}

async function isPhoneLocked(phone) {
  if (!phone) return false;
  const ref = doc(db, DEDUP_COLLECTION, `lock_${sanitizeDedupKey(phone)}`);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const at = Date.parse(snap.data()?.at || '');
      if (!Number.isNaN(at) && Date.now() - at < PHONE_LOCK_WINDOW_MS) return true;
    }
    await setDoc(ref, { at: new Date().toISOString() });
    return false;
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro na trava de concorrência por Firestore:', err.message);
    return false;
  }
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
      const eventName = body.event || body.type || body.data?.event || 'desconhecido';
      console.log(`[WhatsApp Webhook] Evento não-mensagem ignorado: ${eventName}`);
      return NextResponse.json({ success: true, ignored: 'non_message_event' }, { status: 200 });
    }

    // 2. Deduplicação por ID da mensagem (evita processamento duplicado de retries do webhook)
    const messageId = extractMessageId(body);
    if (messageId && await isDuplicateMessage(messageId)) {
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
      // Object.keys(body) (nunca o conteúdo) ajuda a flagrar formato de payload novo da W-API que
      // extractMessageText/extractAudioFromWebhook ainda não reconheçam (ver histórico 24/08/2026).
      console.log(`[WhatsApp Webhook] Sem texto nem áudio reconhecido. Campos do payload: ${Object.keys(body || {}).join(', ')}`);
      return NextResponse.json({ success: true, ignored: 'empty_content' }, { status: 200 });
    }

    console.log(`[WhatsApp Webhook] De: ${senderPhone || 'Desconhecido'} | Texto: "${messageText || ''}" | Audio: ${Boolean(audioSource)}`);

    // 4. Trava de concorrência por telefone (evita disparos paralelos dentro de 3 segundos para o mesmo número)
    if (senderPhone && await isPhoneLocked(senderPhone)) {
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
        console.log('[WhatsApp Webhook] fromMe detectado — IA pausada (intervenção humana).');
      }
      return NextResponse.json({ success: true, ignored: 'from_me_human_takeover' }, { status: 200 });
    }

    if (!senderPhone || senderPhone.length < 8) {
      return NextResponse.json({ success: true, warning: 'Nenhum remetente identificado' }, { status: 200 });
    }

    // 1. Tentar encontrar ID ou número de pedido no texto
    let matchedOrder = null;
    let matchedOrderId = '';

    const candidateId = extractCandidateOrderId(messageText);
    if (candidateId) {
      const found = await findOrderByIdOrNumber(candidateId);
      if (found) {
        matchedOrderId = found.id;
        matchedOrder = found;
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
      const isShortAck = isShortAckMessage(messageText);
      const isExplicitId = Boolean(candidateId);

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
        // Estado FRESCO, não o `matchedOrder` capturado no início da requisição — é o que permite a
        // reserva abaixo fechar a corrida (achado 30/08/2026: mesma mensagem de espera chegando 2x
        // pro cliente no mesmo minuto, quando a W-API reentrega o evento e a segunda chamada chega
        // antes da primeira terminar de enviar).
        let freshData = matchedOrder;
        try {
          const freshSnap = await getDoc(doc(db, 'orders', matchedOrderId));
          if (freshSnap.exists()) freshData = freshSnap.data();
        } catch (e) {}

        // Se NÃO passou ID explícito (caiu aqui só porque o telefone bateu com um pedido existente)
        // E o cliente JÁ foi notificado antes (já recebeu o link da prévia ou pagamento),
        // NÃO reenvia o template completo repetidamente para qualquer mensagem comum (dúvidas, "oi", "não gostei", etc.).
        const alreadyNotified = Boolean(
          freshData.whatsappSent ||
          freshData.paymentWhatsappSent ||
          freshData.readyTemplateSent
        );

        if (!isExplicitId && alreadyNotified) {
          console.log(`[WhatsApp Webhook] Cliente já possui o link do pedido #${matchedOrderId}. Mensagem "${messageText}" não reenvia template de música pronta.`);
          return NextResponse.json({ success: true, ignored: 'already_notified_silence' }, { status: 200 });
        }

        // Mesmo COM ID explícito: não repete um template recém-enviado (ver
        // TEMPLATE_RESEND_COOLDOWN_MS) — vale para qualquer um dos três, já que todos entregam o
        // mesmo link e o cliente veria duas mensagens praticamente iguais. `readyTemplateSending`
        // cobre o envio em andamento AGORA (reservado abaixo) — sem timestamp ainda, porque o envio
        // pode não ter terminado.
        const recentlySent = sentWithinCooldown(freshData.readyTemplateSentAt)
          || sentWithinCooldown(freshData.whatsappSentAt)
          || sentWithinCooldown(freshData.paymentWhatsappSentAt)
          || Boolean(freshData.readyTemplateSending);

        if (recentlySent) {
          console.log(`[WhatsApp Webhook] Template de música pronta enviado (ou sendo enviado) há pouco para o pedido #${matchedOrderId} — não repete.`);
          return NextResponse.json({ success: true, ignored: 'ready_template_cooldown' }, { status: 200 });
        }

        // Reserva o envio ANTES de mandar a mensagem — é isso que fecha a corrida, não a checagem
        // acima sozinha. A escrita de "enviado" só acontecia DEPOIS do envio completar, deixando uma
        // janela do tamanho da chamada inteira (rede até a W-API incluída) em que uma segunda entrega
        // do mesmo evento passava pela checagem sem ver nada ainda gravado. Reservar aqui reduz a
        // janela para dois round-trips de Firestore bem próximos — mesma limitação de sempre (sem
        // runTransaction no SDK Edge, ver payments.js), mas fecha o caso real observado.
        try {
          await updateDoc(doc(db, 'orders', matchedOrderId), { readyTemplateSending: true });
        } catch (e) {}

        const isPaid = freshData.paymentStatus === 'PAGAMENTO_APROVADO' || freshData.paymentStatus === 'PAGO';
        const urls = (freshData.audioFiles?.length ? freshData.audioFiles : [freshData.audioUrl]).filter(Boolean);
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
        try {
          await updateDoc(doc(db, 'orders', matchedOrderId), {
            readyTemplateSent: true,
            readyTemplateSentAt: new Date().toISOString(),
          });
        } catch (e) {}

        return NextResponse.json({ success: true, action: 'sent_ready_link' }, { status: 200 });
      } else {
        // A música ainda está sendo gerada pela IA:
        // Se o cliente já recebeu o aviso de espera (whatsappWaitAckSent) e não mandou um ID novo explícito,
        // NÃO repete a mensagem de espera para qualquer mensagem de texto subsequente.
        if (matchedOrder.whatsappWaitAckSent && !isExplicitId) {
          console.log(`[WhatsApp Webhook] Mensagem de espera já enviada para o pedido #${matchedOrderId}. Silêncio para mensagem "${messageText}".`);
          return NextResponse.json({ success: true, ignored: 'wait_ack_already_sent' }, { status: 200 });
        }

        // Mesmo COM ID explícito: não repete o que o cliente acabou de receber (ver
        // TEMPLATE_RESEND_COOLDOWN_MS). Sem isso, duas mensagens seguidas vindas do botão do site —
        // que sempre carrega o ID — geravam duas respostas idênticas.
        if (sentWithinCooldown(matchedOrder.whatsappWaitAckSentAt)) {
          console.log(`[WhatsApp Webhook] Aviso de espera enviado há pouco para o pedido #${matchedOrderId} — não repete.`);
          return NextResponse.json({ success: true, ignored: 'wait_ack_cooldown' }, { status: 200 });
        }

        const replyMsg = `⏳ *Olá, ${customerName}!*

Localizei seu pedido ${orderNum ? `*(${orderNum})* ` : ''}para *${honoreeName}*! 🎧

Nosso estúdio está finalizando a gravação das 2 versões da música neste momento (leva de 1 a 2 minutinhos).

Assim que a renderização terminar, eu te envio os arquivos e o link direto aqui nesta conversa! 💜

───────────────────
💬 *Precisa de suporte?* Nossa equipe humana já vai te responder!`;

        await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        try {
          await updateDoc(doc(db, 'orders', matchedOrderId), {
            whatsappWaitAckSent: true,
            whatsappWaitAckSentAt: new Date().toISOString(),
          });
        } catch (e) {}

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
