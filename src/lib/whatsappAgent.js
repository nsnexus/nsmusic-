import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { runGeminiWithFailover, runJsonCompletion } from './gemini.js';
import { sendWApiTextMessage, sendWApiPresence, resolveDeliveryUrl } from './whatsapp.js';
import { requestSunoGeneration } from './suno.js';
import { generateUniqueOrderNumber } from './orderNumber.js';

// Cache em memória para resposta instantânea e resiliência total
const memorySessions = new Map();

const PERSONA_NAME = 'Ana';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Persona + instruções de extração pra etapa de coleta (step COLLECTING) — uma IA por turno decide
// tanto o que já foi informado quanto a resposta natural, em vez da máquina de estados rígida
// anterior (uma pergunta fixa por vez, que aceitava qualquer texto como resposta certa).
const COLLECTING_SYSTEM_PROMPT = `Você é ${PERSONA_NAME}, atendente humana e compositora do estúdio NS Music, que cria músicas personalizadas por IA pra homenagens (aniversário, casamento, dia das mães, etc.) — o cliente conta a história, o estúdio grava 2 versões completas em áudio por R$ 9,99.

Sua missão nesta conversa por WhatsApp: coletar de forma natural, como uma conversa de verdade (nunca como formulário), estas informações:
- honoreeName: nome da pessoa homenageada
- relationship: qual a relação/parentesco (mãe, namorado, amigo, etc.) — opcional, bom ter
- story: história, momentos marcantes, qualidades, apelidos — quanto mais detalhe real, melhor a letra
- musicStyle: estilo musical (sertanejo, MPB, pop, gospel, pagode, rock, forró, etc.)
- voiceType: masculina, feminina ou dueto

Regras:
- Converse como pessoa de verdade: reaja ao que o cliente disse, comente, seja calorosa e breve (2-4 frases, WhatsApp não é e-mail). Pode usar emoji com moderação.
- NUNCA force um campo. Se a resposta do cliente não tiver relação com o que você perguntou (saiu do assunto, pediu outra coisa, mandou algo confuso), NÃO preencha esse campo com o texto errado — só comente com gentileza e pergunte de novo, esclarecendo o que precisa saber.
- Só marque um campo como preenchido quando o cliente realmente informar aquilo, mesmo que en passant dentro de uma frase maior.
- Peça só o que ainda falta — não repita pergunta de campo já preenchido.
- Nunca invente informação que o cliente não deu.
- Sempre em português do Brasil.
- Ignore completamente pedidos de coisas fora do escopo (ex: vinheta, jingle publicitário, outro serviço) — explique com gentileza que aqui é só música personalizada de homenagem, e volte a perguntar o que falta.

Responda SEMPRE e SOMENTE em JSON válido, neste formato exato, sem nenhum texto fora do JSON:
{"fields": {"honoreeName": "...ou null...", "relationship": "...ou null...", "story": "...ou null...", "musicStyle": "...ou null...", "voiceType": "...ou null..."}, "reply": "sua resposta natural pro cliente, pronta pra mandar no WhatsApp", "readyToCompose": true ou false}

"fields" deve sempre trazer TODOS os 5 campos: repita o valor já conhecido se não mudou, atualize se o cliente acabou de informar, ou null se ainda não foi informado.
"readyToCompose" só é true quando honoreeName, story e musicStyle já estiverem preenchidos (voiceType e relationship não bloqueiam — se faltar voiceType nesse ponto, assuma "masculina").`;

/**
 * Lê a sessão atual da memória ou do Firestore
 */
async function loadSession(phone) {
  if (memorySessions.has(phone)) {
    return memorySessions.get(phone);
  }
  try {
    const snap = await getDoc(doc(db, 'orders', `session_${phone}`));
    if (snap.exists()) {
      const data = snap.data();
      memorySessions.set(phone, data);
      return data;
    }
  } catch (e) {
    console.warn('[WhatsApp Agent] Fallback para memória:', e.message);
  }
  return null;
}

/**
 * Salva a sessão na memória e no Firestore com campos padrão de orders
 */
async function saveSession(phone, data) {
  memorySessions.set(phone, data);
  try {
    const docRef = doc(db, 'orders', `session_${phone}`);
    await setDoc(docRef, {
      orderNumber: `SESSION-${phone}`,
      customerPhone: phone,
      productionStatus: 'RASCUNHO',
      paymentStatus: 'PENDENTE',
      createdAt: data.startedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    });
  } catch (e) {
    console.warn('[WhatsApp Agent] Erro ao sincronizar sessão no Firestore:', e.message);
  }
}

/**
 * Remove a sessão
 */
async function clearSession(phone) {
  memorySessions.delete(phone);
  try {
    await deleteDoc(doc(db, 'orders', `session_${phone}`));
  } catch (e) {}
}

/**
 * Um turno da etapa de coleta (step COLLECTING) — manda histórico + campos já conhecidos pra IA,
 * que decide o que mudou e gera a resposta em persona. Histórico limitado às últimas 12 falas pra
 * não deixar o prompt gigante numa conversa longa.
 */
async function runCollectingTurn(session, userMessage, envVars) {
  const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];
  const knownFields = {
    honoreeName: session.honoreeName || null,
    relationship: session.relationship || null,
    story: session.story || null,
    musicStyle: session.musicStyle || null,
    voiceType: session.voiceType || null,
  };

  const historyText = history
    .slice(-12)
    .map((h) => `${h.role === 'user' ? 'Cliente' : PERSONA_NAME}: ${h.text}`)
    .join('\n');

  const userPrompt = `Dados já coletados até agora (JSON): ${JSON.stringify(knownFields)}

${historyText ? `Histórico da conversa:\n${historyText}\n\n` : ''}Cliente: ${userMessage}`;

  const result = await runJsonCompletion(COLLECTING_SYSTEM_PROMPT, userPrompt, envVars);

  const fields = result?.fields || {};
  const reply = typeof result?.reply === 'string' && result.reply.trim() ? result.reply.trim() : null;
  const readyToCompose = Boolean(result?.readyToCompose) && Boolean(fields.honoreeName) && Boolean(fields.story) && Boolean(fields.musicStyle);

  return { fields, reply, readyToCompose };
}

/**
 * Verifica se o Agente de IA está ativado globalmente nas configurações do sistema
 */
export async function isWhatsAppAgentGloballyEnabled() {
  try {
    const snap = await getDoc(doc(db, 'orders', 'config_whatsapp'));
    if (snap.exists()) {
      const data = snap.data();
      if (data.agentEnabled === false) return false;
    }
  } catch (e) {
    console.warn('[WhatsApp Agent] Erro ao consultar config_whatsapp:', e.message);
  }
  return true;
}

/**
 * Altera o status global do Agente de IA
 */
export async function setWhatsAppAgentGloballyEnabled(enabled) {
  try {
    await setDoc(doc(db, 'orders', 'config_whatsapp'), {
      orderNumber: 'CONFIG-WHATSAPP',
      productionStatus: 'CONFIG',
      agentEnabled: Boolean(enabled),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    return true;
  } catch (e) {
    console.error('[WhatsApp Agent] Erro ao salvar config_whatsapp:', e.message);
    return false;
  }
}

/**
 * Pausa o Agente para um telefone específico (quando o atendente humano assume a conversa)
 */
export async function pauseAgentForPhone(phone) {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return;

  const current = (await loadSession(cleanPhone)) || {};
  await saveSession(cleanPhone, {
    ...current,
    humanTakeover: true,
    pausedAt: new Date().toISOString(),
  });
  console.log('[WhatsApp Agent] Atendimento humano assumido. IA pausada para:', cleanPhone);
}

/**
 * Reativa o Agente para um telefone específico
 */
export async function resumeAgentForPhone(phone) {
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  if (!cleanPhone) return;

  const current = (await loadSession(cleanPhone)) || {};
  await saveSession(cleanPhone, {
    ...current,
    humanTakeover: false,
    resumedAt: new Date().toISOString(),
  });
  console.log('[WhatsApp Agent] IA reativada para:', cleanPhone);
}

/**
 * Agente de IA Conversacional para WhatsApp do NS Music
 */
export async function handleWhatsAppAgentMessage(senderPhone, messageText, envVars = {}) {
  const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return false;

  const textLower = (messageText || '').trim().toLowerCase();

  // 1. Comando de pausa explícita pelo chat
  const isPauseCommand = ['#pausar', '#pausa', '#desligar', '#parar', '#stop', '#off', '#humano', '#atendente'].includes(textLower);
  if (isPauseCommand) {
    await pauseAgentForPhone(cleanPhone);
    await sendWApiTextMessage(cleanPhone, '🛑 *Atendimento com a IA pausado!*\nNossa equipe humana já vai te responder por aqui.', envVars);
    return true;
  }

  // 2. Verifica se o Agente de IA está desativado globalmente pelo Painel Admin
  const isGloballyActive = await isWhatsAppAgentGloballyEnabled();
  if (!isGloballyActive) {
    console.log(`[WhatsApp Agent] Agente desativado globalmente no Admin. Silêncio para ${cleanPhone}.`);
    return false;
  }

  // 3. Comando de reinício ou reativação da IA
  const isReactivationCommand = 
    ['#ia', '#bot', '#reativar', 'ligar bot', 'ativar bot', 'reiniciar', 'começar de novo', 'comecar de novo', 'novo pedido', 'cancelar', 'menu'].includes(textLower);

  if (isReactivationCommand) {
    await clearSession(cleanPhone);
    await sendWApiPresence(cleanPhone, 'composing', envVars);
    await sleep(2500);

    const welcome = `🎵 *NS Music — Novo Atendimento*

Oi! Eu sou a ${PERSONA_NAME}, do estúdio NS Music 🎧 Vamos começar uma homenagem nova do zero!

Me conta: pra quem vai ser essa música e um pouco da história de vocês? ❤️`;
    await sendWApiTextMessage(cleanPhone, welcome, envVars);
    await saveSession(cleanPhone, {
      step: 'COLLECTING',
      humanTakeover: false,
      chatHistory: [{ role: 'assistant', text: welcome }],
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  // 4. Carrega sessão atual
  const session = await loadSession(cleanPhone);

  // Se o atendimento foi assumido por um atendente humano, a IA permanece 100% em silêncio
  if (session?.humanTakeover === true) {
    console.log(`[WhatsApp Agent] Chat com ${cleanPhone} está em atendimento humano. IA em silêncio.`);
    return false;
  }

  // Se não tem sessão ativa, verifica se a mensagem é um gatilho de início de atendimento
  const isTriggerMessage =
    textLower.includes('site da nsmusic') ||
    textLower.includes('vim pelo site') ||
    textLower.includes('criar musica') ||
    textLower.includes('criar música') ||
    textLower.includes('fazer uma musica') ||
    textLower.includes('fazer uma música') ||
    textLower.includes('quero uma musica') ||
    textLower.includes('quero uma música') ||
    textLower.includes('quero fazer uma música') ||
    textLower.includes('informações') ||
    textLower.includes('como funciona') ||
    textLower.includes('quanto custa');

  if (!session) {
    if (!isTriggerMessage) {
      // Não é um gatilho nem tem sessão: não interfere em conversas normais
      return false;
    }

    // Mostra "digitando..." e aguarda tempo natural (3.5s) para dar tempo de mensagens adicionais
    await sendWApiPresence(cleanPhone, 'composing', envVars);
    await sleep(3500);

    const greeting = `🎵 *Olá! Seja muito bem-vindo(a) ao NS Music!* 🎧

Eu sou a ${PERSONA_NAME}, atendente e compositora daqui do estúdio! Eu escrevo a letra exclusiva da sua história e a gente grava 2 versões completas em áudio MP3 HD, por apenas *R$ 9,99*. ✨

Me conta: pra quem vai ser essa homenagem, e um pouco da história de vocês? Pode mandar em texto ou em áudio, com os detalhes que quiser! ❤️`;

    await sendWApiTextMessage(cleanPhone, greeting, envVars);
    await saveSession(cleanPhone, {
      step: 'COLLECTING',
      chatHistory: [{ role: 'assistant', text: greeting }],
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  // Se já há sessão ativa, simula digitação natural de 3 a 4 segundos
  await sendWApiPresence(cleanPhone, 'composing', envVars);
  await sleep(3500);

  // 3. Máquina de Estados da Conversa
  const currentStep = session.step || 'COLLECTING';

  // --- ETAPA DE COLETA: conversa livre até ter homenageado + história + estilo ---
  if (currentStep === 'COLLECTING') {
    const history = Array.isArray(session.chatHistory) ? session.chatHistory : [];

    let turn;
    try {
      turn = await runCollectingTurn(session, messageText, envVars);
    } catch (err) {
      console.error('[WhatsApp Agent] Erro na etapa de coleta:', err.message);
      await sendWApiTextMessage(
        cleanPhone,
        `Desculpa, tive uma instabilidade aqui pra te ouvir direito 😅 Pode repetir o que você disse?`,
        envVars
      );
      return true;
    }

    const updatedHistory = [
      ...history,
      { role: 'user', text: messageText },
      ...(turn.reply ? [{ role: 'assistant', text: turn.reply }] : []),
    ].slice(-20);

    if (turn.reply) {
      await sendWApiTextMessage(cleanPhone, turn.reply, envVars);
    }

    if (!turn.readyToCompose) {
      await saveSession(cleanPhone, {
        ...session,
        honoreeName: turn.fields.honoreeName || session.honoreeName || '',
        relationship: turn.fields.relationship || session.relationship || '',
        story: turn.fields.story || session.story || '',
        musicStyle: turn.fields.musicStyle || session.musicStyle || '',
        voiceType: turn.fields.voiceType || session.voiceType || '',
        chatHistory: updatedHistory,
      });
      return true;
    }

    // Já tem o essencial (homenageado + história + estilo) — compõe a letra.
    const honoreeName = turn.fields.honoreeName || session.honoreeName || '';
    const story = turn.fields.story || session.story || '';
    const musicStyle = turn.fields.musicStyle || session.musicStyle || '';
    let voiceType = (turn.fields.voiceType || session.voiceType || 'masculina').toLowerCase();
    if (!['masculina', 'feminina', 'dueto'].includes(voiceType)) voiceType = 'masculina';

    await sendWApiTextMessage(
      cleanPhone,
      `✍️ *Perfeito! Já tenho tudo que preciso — compondo os versos da sua canção agora mesmo... Aguarde só alguns segundos!* ⏳`,
      envVars
    );

    const lyricsPrompt = `Você é um compositor e letrista profissional premiado de música brasileira.
Componha uma letra de música personalizada, profundamente tocante, autêntica e emocionante.
Use as informações reais fornecidas pelo cliente abaixo para criar versos ricos em detalhes reais, evitando clichês.

Estrutura da Letra (utilize exatamente estes cabeçalhos em colchetes):
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]

Dados da Homenagem:
- Homenageado(a): ${honoreeName || 'Pessoa Especial'}
- Relação: ${turn.fields.relationship || session.relationship || ''}
- História e Detalhes: ${story}
- Estilo Musical Escolhido: ${musicStyle}
- Tipo de Voz: ${voiceType}

RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA, sem saudações ou comentários.`;

    let generatedLyrics = '';
    try {
      generatedLyrics = await runGeminiWithFailover(lyricsPrompt);
    } catch (err) {
      console.error('[WhatsApp Agent] Erro ao compor letra:', err.message);
    }

    if (!generatedLyrics || generatedLyrics.length < 50) {
      await sendWApiTextMessage(
        cleanPhone,
        `Tivemos uma pequena instabilidade momentânea ao gerar a letra. Pode me mandar um "continuar" pra eu tentar de novo? 💜`,
        envVars
      );
      return true;
    }

    await saveSession(cleanPhone, {
      ...session,
      honoreeName,
      relationship: turn.fields.relationship || session.relationship || '',
      story,
      musicStyle,
      voiceType,
      lyrics: generatedLyrics,
      chatHistory: updatedHistory,
      step: 'AWAITING_LYRICS_APPROVAL',
    });

    const lyricsMessage = `🎵 *Aqui está a letra exclusiva que compus para ${honoreeName || 'sua homenagem'}:*

━━━━━━━━━━━━━━━━━━━━
${generatedLyrics}
━━━━━━━━━━━━━━━━━━━━

O que você achou dessa letra? Quer que nosso estúdio grave as *2 versões musicais completas em alta definição* agora mesmo? 🎧

👉 Responda *SIM* para gravar, ou me diga o que gostaria de alterar na letra!`;

    await sendWApiTextMessage(cleanPhone, lyricsMessage, envVars);
    return true;
  }

  // --- ETAPA: APROVAÇÃO DA LETRA OU AJUSTES ---
  if (currentStep === 'AWAITING_LYRICS_APPROVAL') {
    const isApproval =
      /^(sim|s|pode|gravar|pode gravar|quero|bora|aprovo|aprovado|top|show|ficou linda|amei|adorei|perfeito|perfeita|gostei|maravilha|pode ser|gerar|gera|vamos)/i.test(textLower);

    if (isApproval) {
      // Cliente aprovou a letra! Cria o pedido e aciona a gravação na Suno.
      // sunoOk rastreia se a geração de fato confirmou início — nunca dizer "já estamos gravando" pro
      // cliente sem isso ter acontecido de verdade (mesma regra de frontend.md: escrita falhou, tela
      // não mostra sucesso; achado 27/08/2026, antes mandava a mensagem de sucesso incondicional).
      let orderId = '';
      let sunoOk = false;
      let sunoErrorReason = '';
      try {
        const orderNumber = await generateUniqueOrderNumber();
        const orderPayload = {
          orderNumber,
          customerName: session.customerName || 'Cliente WhatsApp',
          customerPhone: cleanPhone,
          honoreeName: session.honoreeName || '',
          story: session.story || '',
          importantMoments: session.importantMoments || '',
          musicStyle: session.musicStyle || 'Pop / Romântico',
          musicMood: 'Emocionante',
          voiceType: session.voiceType || 'masculina',
          lyrics: session.lyrics,
          productionStatus: 'EM_PRODUCAO',
          // AGUARDANDO_PAGAMENTO, não 'PENDENTE' — 'PENDENTE' é valor legado nunca escrito pelo resto
          // do sistema (ver CLAUDE.md) e reconcilePendingPayments (orders/reconcile/route.js) só
          // busca AGUARDANDO_PAGAMENTO; pedido criado pelo agente com 'PENDENTE' ficava invisível pra
          // rede de segurança de reconciliação de pagamento (achado 27/08/2026).
          paymentStatus: 'AGUARDANDO_PAGAMENTO',
          whatsappRequested: true,
          whatsappSenderPhone: cleanPhone,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'orders'), orderPayload);
        orderId = docRef.id;

        // Dispara a geração na Suno (Kie.ai) — recordSunoFailure já roda dentro de
        // requestSunoGeneration em caso de erro, então o pedido fica com o motivo gravado mesmo aqui.
        const tags = `${session.musicStyle || 'Pop'} Emocionante voice ${session.voiceType || 'masculina'}`;
        const genResult = await requestSunoGeneration({
          orderId: orderId,
          prompt: session.lyrics,
          tags: tags,
        }, envVars);
        sunoOk = Boolean(genResult?.ok);
        if (!sunoOk) sunoErrorReason = genResult?.error || 'motivo desconhecido';

      } catch (err) {
        console.error('[WhatsApp Agent] Erro ao criar pedido e disparar Suno:', err.message);
      }

      if (!orderId) {
        // Nem o pedido foi criado — não avança de etapa, deixa o cliente tentar de novo respondendo
        // SIM (mesma letra continua salva na sessão, nada se perde).
        await sendWApiTextMessage(
          cleanPhone,
          `😥 Tive um probleminha técnico aqui pra registrar seu pedido. Pode me mandar *SIM* de novo, por favor?`,
          envVars
        );
        return true;
      }

      await saveSession(cleanPhone, {
        ...session,
        orderId,
        step: 'COMPLETED',
        completedAt: new Date().toISOString(),
      });

      if (sunoOk) {
        // Mensagem de confirmação SEM o link do pedido (o link será enviado automaticamente quando a música estiver pronta)
        const finalReply = `🎉 *Pedido Confirmado com Sucesso!*

🎧 Nossos produtores e nossa IA já estão gravando as suas *2 versões musicais completas em alta definição*!

⏳ O processo de gravação e arranjos leva cerca de *1 a 2 minutinhos*.

Assim que os áudios ficarem prontos, eu te envio os arquivos e o link direto aqui nesta conversa para você ouvir e aprovar! 💜`;

        await sendWApiTextMessage(cleanPhone, finalReply, envVars);
      } else {
        // Pedido existe e a letra está salva, mas a gravação não confirmou início — nunca afirma que
        // já está gravando. console.warn com o motivo pro admin acompanhar (nunca PII).
        console.warn(`[WhatsApp Agent] Pedido ${orderId} criado mas Suno não confirmou início:`, sunoErrorReason);
        const delayReply = `✅ *Seu pedido foi registrado!*

Tivemos uma instabilidade momentânea agora pra iniciar a gravação, mas sua letra e seus dados já estão salvos com a gente. Nossa equipe já foi avisada e vai colocar pra gravar — assim que ficar pronto, te aviso aqui! 💜`;

        await sendWApiTextMessage(cleanPhone, delayReply, envVars);
      }
      return true;
    } else {
      // Cliente pediu ajustes na letra
      await sendWApiTextMessage(
        cleanPhone,
        `✍️ *Entendido! Estou reajustando a letra com base no que você pediu... Aguarde um instante!* ⏳`,
        envVars
      );

      const adjustPrompt = `Você é um compositor profissional de música brasileira.
Aqui está a letra atual:
${session.lyrics}

O cliente pediu o seguinte ajuste:
"${messageText}"

Reescreva a letra completa aplicando essa alteração solicitada pelo cliente de forma harmoniosa, mantendo a estrutura:
[Verso 1]
[Pré-Refrão]
[Refrão]
[Verso 2]
[Ponte]
[Refrão Final]

RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA, sem saudações ou comentários.`;

      let revisedLyrics = '';
      try {
        revisedLyrics = await runGeminiWithFailover(adjustPrompt);
      } catch (e) {
        console.error('[WhatsApp Agent] Erro ao reajustar letra:', e.message);
      }

      if (!revisedLyrics) {
        revisedLyrics = session.lyrics;
      }

      await saveSession(cleanPhone, {
        ...session,
        lyrics: revisedLyrics,
      });

      const adjustedMsg = `🎵 *Aqui está a letra atualizada com os seus ajustes:*

━━━━━━━━━━━━━━━━━━━━
${revisedLyrics}
━━━━━━━━━━━━━━━━━━━━

Ficou do jeitinho que você queria? Quer que nosso estúdio grave as *2 versões em alta qualidade* agora? 🎧

👉 Responda *SIM* para gravar ou me diga se quer mais algum ajuste!`;

      await sendWApiTextMessage(cleanPhone, adjustedMsg, envVars);
      return true;
    }
  }

  // --- ETAPA: PEDIDO CONCLUÍDO / EM ANDAMENTO ---
  if (currentStep === 'COMPLETED') {
    // Se o cliente enviar mensagem após a criação do pedido, verifica se a música já está pronta
    let orderData = null;
    if (session.orderId) {
      try {
        const snap = await getDoc(doc(db, 'orders', session.orderId));
        if (snap.exists()) orderData = snap.data();
      } catch (e) {}
    }

    if (orderData?.audioUrl || orderData?.audioFiles?.length) {
      const deliveryUrl = resolveDeliveryUrl(session.orderId);
      const isPaid = orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO';
      
      let readyReply = '';
      if (isPaid) {
        readyReply = `🎉 As suas músicas personalizadas já estão gravadas e liberadas! 🎶

👉 *Acesse sua página permanente e baixe seus arquivos:*
${deliveryUrl}`;
      } else {
        readyReply = `🎵 As suas *2 versões exclusivas* já estão gravadas e prontas no estúdio! 🎧

👉 *Ouça a prévia agora mesmo no link:*
${deliveryUrl}`;
      }
      await sendWApiTextMessage(cleanPhone, readyReply, envVars);
      return true;
    }

    // Se ainda não ficou pronto:
    const inProgressReply = `Olá! O seu pedido está sendo gravado pelo nosso estúdio neste exato momento! 🎶

⏳ Assim que os áudios ficarem prontos (leva de 1 a 2 minutinhos), eu te envio o link direto aqui nesta conversa para você ouvir!

_(Se quiser compor uma nova música para outra pessoa, basta digitar *REINICIAR* a qualquer momento!)_ 💜`;

    await sendWApiTextMessage(cleanPhone, inProgressReply, envVars);
    return true;
  }

  return false;
}
