import { NextResponse } from 'next/server';
import { readEnvValue } from '@/lib/envValue';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { sendWApiTextMessage, resolveDeliveryUrl, isVideoPurchased, buildAudioDownloadLink, cleanWhatsAppId } from '@/lib/whatsapp';
import {
  handleWhatsAppAgentMessage,
  pauseAgentForPhone,
  resumeAgentForPhone,
  isWhatsAppAgentGloballyEnabled,
  isAgentPausedForPhone,
} from '@/lib/whatsappAgent';
import { findRecentOrderByPhone, isNewSongIntent, findOrderByIdOrNumber, isShortAckMessage } from '@/lib/orderLookup';
import { extractAudioFromWebhook, transcribeAudioWithFailover } from '@/lib/transcribeAudio';

export const runtime = 'edge';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const challenge = searchParams.get('hub.challenge');

  // Verificacao do webhook da Meta (WhatsApp Cloud API): ela chama este GET com hub.mode,
  // hub.verify_token e hub.challenge, e espera o challenge de volta em texto puro.
  //
  // O token e conferido quando WHATSAPP_WEBHOOK_VERIFY_TOKEN esta configurado: sem isso, qualquer
  // um que descubra a URL consegue validar o endpoint como se fosse o dono do app.
  if (challenge) {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const esperado = readEnvValue(env, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN');
    const recebido = searchParams.get('hub.verify_token') || '';

    if (esperado && recebido !== esperado) {
      console.warn('[WhatsApp Webhook] Verificacao recusada: hub.verify_token nao confere.');
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

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

export function extractCandidateOrderId(text) {
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

  // 3. ID cru do documento, colado sozinho (ex: "w4misqMQd27xN3XVIExj").
  //
  // É o que sai quando o cliente copia só o pedaço final do link de entrega em vez do link todo —
  // acontece o tempo inteiro e até 25/09/2026 caía no silêncio. Exige mensagem curta e o formato
  // exato do id do Firestore (20 caracteres, maiúsculas e minúsculas misturadas) para não
  // confundir com uma palavra qualquer da conversa.
  const limpo = str.trim();
  if (/^[A-Za-z0-9]{18,24}$/.test(limpo) && /[a-z]/.test(limpo) && /[A-Z]/.test(limpo)) {
    return limpo;
  }

  // 4. Só o bloco de 4 dígitos do número do pedido (ex: "8337" de NS-MUHEKI5D-8337-2026).
  //
  // É o que o cliente decora e manda. Sozinho ele não identifica o pedido com certeza, então vai
  // marcado com o prefixo `num:` — quem busca (findOrderByIdOrNumber) decide, e só responde se for
  // um único pedido; com mais de um, pede o número completo em vez de mandar a música do vizinho.
  const soDigitos = limpo.match(/^#?(\d{4})$/);
  if (soDigitos) return `num:${soDigitos[1]}`;

  return '';
}

// Número da PRÓPRIA instância, quando o provedor manda.
//
// A Evolution API coloca no nível raiz do payload um campo `sender` com o número da instância —
// ou seja, o NOSSO número, não o do cliente (o cliente fica em data.key.remoteJid). Como
// `body.sender` é um dos candidatos a remetente, o agente passou a ler o próprio número como se
// fosse o cliente e respondia para si mesmo, em laço (relatado em 26/09/2026).
//
// Tudo que bater com este número é descartado da lista de candidatos.
function extractInstanceOwner(body) {
  const bruto = body?.sender ?? body?.owner ?? body?.instanceOwner ?? body?.data?.owner;
  if (!bruto || typeof bruto !== 'string') return '';
  return bruto.replace(/@.*$/, '').replace(/\D/g, '');
}

// Exportada para teste: este e o ponto que fazia o agente responder a si mesmo (ver
// tests/unit/webhookSender.test.js).
// Imagem ou documento anexado. Só detecta a PRESENÇA do anexo — o conteúdo nunca é lido aqui.
export function temAnexoDeComprovante(body) {
  const msg = body?.data?.message || body?.message || body?.msgContent || {};
  if (msg.imageMessage || msg.documentMessage || msg.documentWithCaptionMessage) return true;

  const tipo = String(body?.messageType || body?.data?.messageType || body?.type || '').toLowerCase();
  if (tipo.includes('image') || tipo.includes('document')) return true;

  const mime = String(body?.mimetype || body?.data?.mimetype || '').toLowerCase();
  return mime.startsWith('image/') || mime.includes('pdf');
}

export function extractSenderPhone(body) {
  if (!body) return '';

  // Formato Evolution API: quando a conversa usa LID no WhatsApp moderno, a Evolution coloca
  // o telefone real em remoteJidAlt (ex: "559884888048@s.whatsapp.net"), enquanto remoteJid fica
  // com o LID numérico ("183064944721937@lid"). O telefone real DEVE ser priorizado para permitir
  // localizar o pedido no banco e garantir envio direto!
  const evolutionAlt = body?.data?.key?.remoteJidAlt || body?.key?.remoteJidAlt;
  const evolutionJid = body?.data?.key?.participant || body?.data?.key?.remoteJid;

  const owner = extractInstanceOwner(body);

  const candidates = [
    evolutionAlt,
    evolutionJid,
    // Formato real da W-API — sender é um objeto ({ id, senderLid, pushName, ... }), não uma string;
    // o número puro fica em sender.id (senderLid/chat.id usam o formato novo "@lid" da Meta, que não
    // é o telefone). body.sender sozinho (candidato abaixo) vira "[object Object]" e é descartado.
    body.sender?.id,
    body.chat?.id,
    body.chat?.phone,
    body.phone,
    body.from,
    body.sender,
    body.data?.phone,
    body.data?.from,
    body.data?.sender,
    body.data?.chat?.id,
    body.data?.chat?.phone,
    body.data?.key?.remoteJidAlt,
    body.data?.key?.remoteJid,
    body.data?.key?.participant,
    body.key?.remoteJidAlt,
    body.key?.remoteJid,
    body.key?.participant,
    body.chatId,
    body.data?.chatId,
  ];

  const candidateNames = [
    'data.key.remoteJidAlt(evolution)',
    'data.key.remoteJid(evolution)',
    'sender.id', 'chat.id', 'chat.phone', 'phone', 'from', 'sender', 'data.phone', 'data.from', 'data.sender',
    'data.chat.id', 'data.chat.phone', 'data.key.remoteJidAlt', 'data.key.remoteJid', 'data.key.participant',
    'key.remoteJidAlt', 'key.remoteJid', 'key.participant', 'chatId', 'data.chatId',
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

    // Nunca tratar o número da própria instância como cliente — é o que fazia o agente responder
    // a si mesmo em laço.
    if (owner && raw.replace(/@.*$/, '').replace(/\D/g, '') === owner) continue;

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

// Janela em que NÃO se repete um template que o cliente acabou de receber imediatamente
// (evita disparo duplicado por retentativas concorrentes do webhook). Reduzido de 10min para 45s
// para que clientes que peçam a prévia ou o link novamente sejam prontamente atendidos.
const TEMPLATE_RESEND_COOLDOWN_MS = 45 * 1000;

function sentWithinCooldown(sentAtIso) {
  if (!sentAtIso) return false;
  const ts = Date.parse(sentAtIso);
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < TEMPLATE_RESEND_COOLDOWN_MS;
}

// Verifica se há um envio em andamento neste exato momento (janela curta de até 60s).
// Evita que um boolean legado ou falha de rede trave o pedido para sempre.
// Mensagem de quem está cobrando ou perguntando pela música/prévia que encomendou.
function pareceCobrancaDeMusica(texto) {
  const t = String(texto || '').toLowerCase().trim();
  if (!t) return false;
  if (/^(?:oi|ol[aá]|bom dia|boa tarde|boa noite)?\s*(?:cad[eê]|kd|onde|como|queria|quero|gostaria|preciso|manda|enviar?|ver|ouvir|escutar|passa|receber)?\s*(?:a|minha|o|meu)?\s*(?:pr[eé]via|m[uú]sica|[aá]udio|link)/i.test(t)) return true;
  if (/(?:pr[eé]via|m[uú]sica|[aá]udio|pedido|encomend)/i.test(t) && /(?:cad[eê]|kd|onde|nao recebi|não recebi|nao chegou|não chegou|demora|demorando|ainda|quando|qdo|esperando|aguardando|sumiu|perdi|pronta?|saiu|ficou|ouvir|escutar|link)/i.test(t)) return true;
  if (/^(?:pr[eé]via|m[uú]sica|[aá]udio|link|cad[eê]|kd)\b/i.test(t)) return true;
  if (/(?:pr[eé]via|m[uú]sica)/i.test(t)) return true;
  return false;
}

function isSendingInProgress(orderData) {
  if (!orderData) return false;
  const isSending = orderData.readyTemplateSending === true || orderData.whatsappSending === true || orderData.paymentWhatsappSending === true;
  if (!isSending) return false;

  // Só trava se o envio começou há menos de 60 segundos (evita travamento eterno por crash de worker)
  const sendingAt = orderData.readyTemplateSendingAt || orderData.updatedAt || orderData.createdAt;
  if (sendingAt) {
    const ts = Date.parse(sendingAt);
    if (!Number.isNaN(ts) && Date.now() - ts < 60000) return true;
  }
  return false;
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

async function isDuplicateMessage(msgId, env = {}) {
  if (!msgId) return false;
  try {
    const { getSupabaseEdge } = await import('@/lib/supabase-edge');
    const supabase = getSupabaseEdge(env);
    if (!supabase) return false;
    const chave = `dedup_msg_${sanitizeDedupKey(msgId)}`;
    const { data } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
    if (data?.valor?.at) {
      const at = Date.parse(data.valor.at);
      if (!Number.isNaN(at) && Date.now() - at < MESSAGE_DEDUP_WINDOW_MS) return true;
    }
    await supabase.from('config').upsert({ chave, valor: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
    return false;
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro na deduplicação por Supabase:', err.message);
    return false;
  }
}

async function isPhoneLocked(phone, env = {}) {
  if (!phone) return false;
  try {
    const { getSupabaseEdge } = await import('@/lib/supabase-edge');
    const supabase = getSupabaseEdge(env);
    if (!supabase) return false;
    const chave = `lock_phone_${sanitizeDedupKey(phone)}`;
    const { data } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
    if (data?.valor?.at) {
      const at = Date.parse(data.valor.at);
      if (!Number.isNaN(at) && Date.now() - at < PHONE_LOCK_WINDOW_MS) return true;
    }
    await supabase.from('config').upsert({ chave, valor: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
    return false;
  } catch (err) {
    console.warn('[WhatsApp Webhook] Erro na trava de concorrência por Supabase:', err.message);
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
    if (messageId && await isDuplicateMessage(messageId, envVars)) {
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

    // Comprovante enviado como IMAGEM ou PDF, sem legenda.
    //
    // Acontece o tempo todo: o cliente diz que pagou e manda o print do banco. Até 26/09/2026 isso
    // caía em 'empty_content' e a mensagem era ignorada EM SILÊNCIO — pior ainda porque o próprio
    // bot pedia o comprovante e depois não dava sinal de vida.
    //
    // Não lemos o arquivo: quem decide se o pagamento existe é a Efí, consultada na hora (ver
    // conferirPagamento em src/lib/agentTools.js). O anexo é tratado como a FRASE que ele
    // representa, e o resto do fluxo faz o que já sabe fazer — inclusive liberar e mandar o link.
    if (!messageText && !audioSource && temAnexoDeComprovante(body)) {
      messageText = 'enviei o comprovante, já paguei';
      console.log('[WhatsApp Webhook] Anexo recebido sem legenda — tratando como aviso de pagamento.');
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
    if (senderPhone && await isPhoneLocked(senderPhone, envVars)) {
      console.log(`[WhatsApp Webhook] Processamento concorrente descartado para: ${senderPhone}`);
      return NextResponse.json({ success: true, ignored: 'concurrent_lock' }, { status: 200 });
    }

    // Quando a mensagem foi enviada por nós mesmos (fromMe: true), detectamos intervenção humana
    if (body.fromMe === true || body.data?.key?.fromMe === true || body.key?.fromMe === true) {
      // O telefone do cliente que está sendo atendido é o chat.id / remoteJid, nunca o sender.id (estúdio)
      const chatPhone = body.chat?.id || body.chat?.phone || body.data?.chat?.id || body.data?.key?.remoteJid || body.key?.remoteJid;
      const targetPhone = chatPhone ? cleanWhatsAppId(chatPhone) : senderPhone;

      if (targetPhone) {
        const lower = (messageText || '').toLowerCase();
        // Se o atendente humano enviou comando explícito para reativar o bot:
        if (lower.includes('#ia') || lower.includes('#bot') || lower.includes('#ligar')) {
          await resumeAgentForPhone(targetPhone, envVars);
          return NextResponse.json({ success: true, action: 'agent_resumed_by_human' }, { status: 200 });
        }

        // Caso contrário, qualquer mensagem enviada manualmente pelo WhatsApp pausa a IA automaticamente para este cliente:
        await pauseAgentForPhone(targetPhone, envVars);
        console.log('[WhatsApp Webhook] fromMe detectado — IA pausada para cliente:', targetPhone);
      }
      return NextResponse.json({ success: true, ignored: 'from_me_human_takeover' }, { status: 200 });
    }

    if (!senderPhone || senderPhone.length < 8) {
      return NextResponse.json({ success: true, warning: 'Nenhum remetente identificado' }, { status: 200 });
    }

    // Identifica se a mensagem é uma referência/pedido de música com ID explícito (NS-..., id=..., #...)
    const candidateId = extractCandidateOrderId(messageText);
    const hasOrderReference = Boolean(candidateId);

    // O bot SÓ deve responder automaticamente se a mensagem trouxer explicitamente o ID do pedido.
    // Qualquer outra mensagem (perguntas, bate-papo, mensagens de áudio) é tratada como atendimento humano do estúdio.
    const isDirectOrderRequest = hasOrderReference;
    const isExplicitPreviewRequest = isDirectOrderRequest;

    // A. Master switch: se o robô conversacional estiver desativado no Admin (Atendimento 100% Humano),
    // qualquer mensagem que não traga o ID do pedido fica em silêncio absoluto.
    const isGloballyActive = await isWhatsAppAgentGloballyEnabled(envVars);
    if (!isGloballyActive && !isDirectOrderRequest) {
      console.log(`[WhatsApp Webhook] Mensagem sem ID de pedido de ${senderPhone}. Silêncio (robô desativado / atendimento humano).`);
      return NextResponse.json({ success: true, ignored: 'agent_globally_disabled' }, { status: 200 });
    }

    // B. Atendimento humano: se o atendente humano assumiu este chat e ainda não se passaram 12h,
    // silêncio exceto se o cliente mandar explicitamente o ID do pedido.
    const isPaused = await isAgentPausedForPhone(senderPhone, envVars);
    if (isPaused && !isDirectOrderRequest) {
      const lower = (messageText || '').toLowerCase();
      const isReactivationCommand = ['#ia', '#bot', '#reativar', 'ligar bot', 'ativar bot'].includes(lower);
      if (isReactivationCommand) {
        await resumeAgentForPhone(senderPhone, envVars);
        console.log(`[WhatsApp Webhook] IA reativada pelo cliente ${senderPhone} com comando.`);
      } else {
        console.log(`[WhatsApp Webhook] Cliente ${senderPhone} em atendimento humano ativo. Silêncio da IA.`);
        return NextResponse.json({ success: true, ignored: 'human_takeover_active' }, { status: 200 });
      }
    }

    // 1. Tentar encontrar pedido pelo ID ou número informado no texto
    let matchedOrder = null;
    let matchedOrderId = '';

    if (candidateId) {
      const found = await findOrderByIdOrNumber(candidateId, envVars);
      if (found) {
        matchedOrderId = found.id;
        matchedOrder = found;
      } else if (candidateId.startsWith('num:')) {
        // Mandou só os 4 dígitos e não deu para identificar com certeza (o bloco se repete em ~5%
        // dos pedidos). Pedir o número completo é melhor do que arriscar mandar a música errada.
        await sendWApiTextMessage(
          senderPhone,
          'Achei mais de um pedido com esse final. 🙈 Me manda o número completo (NS-...) ou o link da sua página de entrega que eu te mando a música na hora!',
          envVars
        );
        return NextResponse.json({ success: true, action: 'numero_ambiguo' }, { status: 200 });
      }
    }

    // Se NÃO passou ID explícito de pedido, o bot NÃO responde (silêncio total para o atendimento humano):
    if (!matchedOrder || !matchedOrderId) {
      console.log(`[WhatsApp Webhook] Mensagem sem ID de pedido de ${senderPhone} — silêncio total para permitir atendimento humano.`);
      return NextResponse.json({ success: true, ignored: 'no_order_id_in_message' }, { status: 200 });
    }

    // Se encontrou o pedido do cliente por ID explícito:
    if (matchedOrder && matchedOrderId) {
      const isShortAck = isShortAckMessage(messageText);
      const isExplicitId = Boolean(candidateId);
      const isDefaultSiteButtonText = messageText.includes('Quero receber a prévia da música do meu pedido');
      const isMusicInquiry = pareceCobrancaDeMusica(messageText);
      const hasAudioReady = Boolean(matchedOrder.audioUrl || matchedOrder.audioFiles?.length);
      const isDirectMusicRequest = true;

      // Primeiro nome só. Ninguém chama a pessoa pelo nome completo no WhatsApp, e "Olá,
      // Cliente!" (o padrão antigo quando o nome faltava) é a assinatura de mensagem automática.
      const nomeCompleto = String(matchedOrder.customerName || '').trim();
      const customerName = nomeCompleto ? nomeCompleto.split(/\s+/)[0] : '';
      const honoreeName = matchedOrder.honoreeName || 'alguém especial';
      const deliveryUrl = resolveDeliveryUrl(matchedOrderId);

      // Marca que o cliente solicitou o envio pelo WhatsApp
      try {
        await updateOrder(matchedOrderId, {
          whatsappRequested: true,
          whatsappSenderPhone: senderPhone,
          updatedAt: new Date().toISOString(),
        }, envVars);
      } catch (e) {}

      // Se foi só um "ok"/"obrigado"/emoji (isShortAckMessage) sem ID explícito e o cliente JÁ foi
      // notificado antes, não reenvia nada — silêncio cortês.
      const alreadyNotified = Boolean(
        matchedOrder.whatsappSent ||
        matchedOrder.paymentWhatsappSent ||
        matchedOrder.readyTemplateSent
      );

      if (isShortAck && !isExplicitId && alreadyNotified) {
        console.log(`[WhatsApp Webhook] Confirmação curta ("${messageText}") e pedido #${matchedOrderId} já notificado. Silêncio.`);
        return NextResponse.json({ success: true, ignored: 'already_notified_short_ack_silence' }, { status: 200 });
      }

      if (matchedOrder.audioUrl || matchedOrder.audioFiles?.length) {
        // Se a música já estiver pronta e o cliente solicitou diretamente:
        let freshData = matchedOrder;
        try {
          const freshOrder = await getOrder(matchedOrderId, envVars);
          if (freshOrder) freshData = freshOrder;
        } catch (e) {}

        // Se há um envio em andamento neste exato momento (janela de até 60s), evita disparo duplicado concorrente:
        if (isSendingInProgress(freshData)) {
          return NextResponse.json({ success: true, ignored: 'sending_in_progress' }, { status: 200 });
        }

        const isPaid = freshData.paymentStatus === 'PAGAMENTO_APROVADO' || freshData.paymentStatus === 'PAGO';

        // Para cliente com pagamento aprovado, o cooldown só se aplica se a confirmação de pagamento já foi enviada há pouco.
        // Nunca bloqueia o envio do pagamento aprovado por causa do aviso da prévia gratuita enviado anteriormente.
        const lastSentAt = isPaid
          ? freshData.paymentWhatsappSentAt
          : (freshData.readyTemplateSentAt || freshData.whatsappSentAt);

        const recentlySent = isExplicitId
          ? (lastSentAt && (Date.now() - Date.parse(lastSentAt) < 30000))
          : (isPaid
              ? (lastSentAt && (Date.now() - Date.parse(lastSentAt) < 60000))
              : (sentWithinCooldown(freshData.readyTemplateSentAt) || sentWithinCooldown(freshData.whatsappSentAt)));

        if (recentlySent) {
          console.log(`[WhatsApp Webhook] Mensagem de ${isPaid ? 'pagamento aprovado' : 'música pronta'} enviada há pouco para o pedido #${matchedOrderId} — não repete.`);
          return NextResponse.json({ success: true, ignored: 'ready_template_cooldown' }, { status: 200 });
        }

        // Reserva o envio ANTES de mandar a mensagem — janela curta de até 60s
        try {
          await updateOrder(matchedOrderId, {
            readyTemplateSending: true,
            whatsappSending: true,
            readyTemplateSendingAt: new Date().toISOString(),
          }, envVars);
        } catch (e) {}

        const urls = (freshData.audioFiles?.length ? freshData.audioFiles : [freshData.audioUrl]).filter(Boolean);
        const audiosList = urls
          .map((link, idx) => `• *Versão ${idx + 1}:* ${buildAudioDownloadLink(link, `NS-Music-${honoreeName}-Versao-${idx + 1}.mp3`)}`)
          .join('\n');

        let replyMsg = '';
        if (isPaid) {
          const userHasVideo = isVideoPurchased(matchedOrder);
          const videoBlock = userHasVideo
            ? `\nO vídeo também tá liberado — é só mandar de 10 a 20 fotos nessa mesma página que eu sincronizo com a música. 📸\n`
            : `\nSe quiser, dá pra transformar em vídeo com as fotos de ${honoreeName} por R$ 6,90 — tá na mesma página. 🎬\n`;

          replyMsg = `${customerName ? `${customerName}, s` : 'S'}eu pagamento caiu! 🎉 A música de ${honoreeName} tá liberada.

${audiosList ? `${audiosList}\n\n` : ''}A página completa fica aqui:
${deliveryUrl}
${videoBlock}
Qualquer coisa é só me chamar por aqui. 💜`;
        } else {
          replyMsg = `${customerName ? `Oi, ${customerName}! ` : 'Oi! '}A música de ${honoreeName} ficou pronta. 🎧

Gravei 2 versões, com arranjos diferentes, pra você escolher. Ouça aqui:
${deliveryUrl}

Se precisar de qualquer coisa, é só me chamar.`;
        }

        try {
          const sendRes = await sendWApiTextMessage(senderPhone, replyMsg, envVars);
          if (sendRes?.success) {
            try {
              const updatePayload = {
                whatsappSent: true,
                whatsappSentAt: new Date().toISOString(),
                readyTemplateSending: false,
                whatsappSending: false,
              };
              if (isPaid) {
                updatePayload.paymentWhatsappSent = true;
                updatePayload.paymentWhatsappSentAt = new Date().toISOString();
              } else {
                updatePayload.readyTemplateSent = true;
                updatePayload.readyTemplateSentAt = new Date().toISOString();
              }
              await updateOrder(matchedOrderId, updatePayload, envVars);
            } catch (e) {}
          } else {
            console.warn(`[WhatsApp Webhook] Falha ao enviar link de música para ${senderPhone}:`, sendRes?.error);
          }
        } finally {
          try {
            await updateOrder(matchedOrderId, {
              readyTemplateSending: false,
              whatsappSending: false,
            }, envVars);
          } catch (e) {}
        }

        return NextResponse.json({ success: true, action: 'sent_ready_link' }, { status: 200 });
      } else {
        // A música ainda está sendo gerada pela IA e o cliente solicitou diretamente:
        const waitCooldownMs = 60000;
        const waitSentAt = Date.parse(matchedOrder.whatsappWaitAckSentAt || '');
        if (!Number.isNaN(waitSentAt) && Date.now() - waitSentAt < waitCooldownMs) {
          console.log(`[WhatsApp Webhook] Aviso de espera enviado há pouco para o pedido #${matchedOrderId} — não repete.`);
          return NextResponse.json({ success: true, ignored: 'wait_ack_cooldown' }, { status: 200 });
        }

        const replyMsg = `${customerName ? `Oi, ${customerName}! ` : 'Oi! '}A música de ${honoreeName} ainda tá sendo finalizada aqui — leva uns minutinhos. ⏳

Assim que ficar pronta eu te mando o link aqui mesmo, pode deixar comigo. 💜`;

        const sendWaitRes = await sendWApiTextMessage(senderPhone, replyMsg, envVars);
        if (sendWaitRes?.success) {
          try {
            await updateOrder(matchedOrderId, {
              whatsappWaitAckSent: true,
              whatsappWaitAckSentAt: new Date().toISOString(),
            }, envVars);
          } catch (e) {}
        }

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

    // 3. Cliente cobrando a música, mas não achamos o pedido dele.
    //
    // Acontece quando o WhatsApp entrega um LID no lugar do número (o identificador interno, com
    // mais dígitos que um telefone brasileiro) — aí nenhuma das variantes bate com o customerPhone
    // gravado no pedido e a mensagem morre em silêncio. Como o robô pode estar desligado no painel
    // (estava, desde 15/09/2026), o cliente ficava sem resposta nenhuma enquanto a música existia.
    //
    // Esta resposta é fixa, não passa por IA e não depende do robô: só pede o dado que destrava a
    // busca. Restrita a quem está claramente cobrando a música, para nunca escrever primeiro a
    // quem não pediu nada (regra anti-ban do projeto: nada de mensagem a quem não iniciou conversa).
    if (!matchedOrder && senderPhone && pareceCobrancaDeMusica(messageText)) {
      try {
        await sendWApiTextMessage(
          senderPhone,
          'Oi! Achei sua mensagem aqui, mas não localizei seu pedido por este número. 🙏\n\n'
          + 'Me manda o *número do pedido* (aquele NS-... que aparece no site) ou o *link da sua página de entrega*, que eu te mando a música na hora.',
          envVars
        );
        return NextResponse.json({ success: true, action: 'pediu_identificacao_do_pedido' }, { status: 200 });
      } catch (e) {
        console.warn('[WhatsApp Webhook] Falha ao pedir identificação do pedido:', e.message);
      }
    }

    // 4. Se não for gatilho de atendimento nem houver sessão ativa, ignora silenciosamente para não atrapalhar conversas pessoais
    return NextResponse.json({ success: true, ignored: 'regular_conversation' }, { status: 200 });

  } catch (err) {
    console.error('[WhatsApp Webhook] Erro geral:', err.message, err.stack);
    return NextResponse.json({ success: true, error: `general_error: ${err.message}` }, { status: 200 });
  }
}
