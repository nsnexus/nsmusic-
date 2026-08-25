import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { runGeminiWithFailover, runJsonCompletion } from './gemini.js';
import { sendWApiTextMessage, resolveDeliveryUrl } from './whatsapp.js';
import { requestSunoGeneration } from './suno.js';
import { generateUniqueOrderNumber } from './orderNumber.js';

// Cache em memória para resposta instantânea (<500ms) e resiliência total
const memorySessions = new Map();

const PERSONA_NAME = 'Ana';

// Persona + instruções de extração pra etapa de coleta (step COLLECTING) — uma IA por turno decide
// tanto o que já foi informado quanto a resposta natural, em vez da máquina de estados rígida
// anterior (uma pergunta fixa por vez, que aceitava qualquer texto como resposta certa — "boa"
// virava nome do homenageado, "vinheta" quebrava o fluxo, ver incidente 25/08/2026).
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
 * Agente de IA Conversacional para WhatsApp do NS Music
 */
export async function handleWhatsAppAgentMessage(senderPhone, messageText, envVars = {}) {
  const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return false;

  const textLower = (messageText || '').trim().toLowerCase();

  // 1. Comando de reinício
  if (['reiniciar', 'começar de novo', 'comecar de novo', 'novo pedido', 'cancelar', 'menu'].includes(textLower)) {
    await clearSession(cleanPhone);
    const welcome = `🎵 *NS Music — Novo Atendimento*

Oi! Eu sou a ${PERSONA_NAME}, do estúdio NS Music 🎧 Vamos começar uma homenagem nova do zero!

Me conta: pra quem vai ser essa música e um pouco da história de vocês? ❤️`;
    await sendWApiTextMessage(cleanPhone, welcome, envVars);
    await saveSession(cleanPhone, {
      step: 'COLLECTING',
      chatHistory: [{ role: 'assistant', text: welcome }],
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  // 2. Carrega sessão atual
  const session = await loadSession(cleanPhone);

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

    // Inicia nova sessão com uma saudação fixa (resposta instantânea, sem esperar IA) e já entra
    // direto na etapa de coleta livre — a próxima mensagem do cliente já é tratada pela IA.
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
        `Tivemos uma pequena instabilidade momentânea ao compor a letra. Pode me mandar de novo o estilo musical que eu tento outra vez? 💜`,
        envVars
      );
      await saveSession(cleanPhone, {
        ...session,
        honoreeName,
        relationship: turn.fields.relationship || session.relationship || '',
        story,
        musicStyle,
        voiceType,
        chatHistory: updatedHistory,
      });
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
      // Cliente aprovou a letra! Cria o pedido e aciona a Suno
      await sendWApiTextMessage(
        cleanPhone,
        `🚀 *Excelente! Criando seu pedido e iniciando a gravação no estúdio agora mesmo...* 🎧`,
        envVars
      );

      let orderId = '';
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
          paymentStatus: 'PENDENTE',
          whatsappRequested: true,
          whatsappSenderPhone: cleanPhone,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'orders'), orderPayload);
        orderId = docRef.id;

        // Dispara a geração na Suno (Kie.ai)
        const tags = `${session.musicStyle || 'Pop'} Emocionante voice ${session.voiceType || 'masculina'}`;
        await requestSunoGeneration({
          orderId: orderId,
          prompt: session.lyrics,
          tags: tags,
        }, envVars);

      } catch (err) {
        console.error('[WhatsApp Agent] Erro ao criar pedido e disparar Suno:', err.message);
      }

      await saveSession(cleanPhone, {
        ...session,
        orderId,
        step: 'COMPLETED',
        completedAt: new Date().toISOString(),
      });

      const deliveryUrl = resolveDeliveryUrl(orderId);

      const finalReply = `🎉 *Pedido Gerado com Sucesso!*

🎧 Nosso estúdio profissional já está renderizando as suas *2 versões completas em alta definição*!

Em cerca de 1 a 2 minutos seus áudios estarão prontos para você ouvir.

👉 *Acompanhe a produção e libere seus arquivos aqui:*
${deliveryUrl}

Assim que os arranjos terminarem de gravar, eu também te aviso aqui nesta conversa com o link direto! 💜`;

      await sendWApiTextMessage(cleanPhone, finalReply, envVars);
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

  // --- ETAPA: PEDIDO CONCLUÍDO ---
  if (currentStep === 'COMPLETED') {
    const deliveryUrl = resolveDeliveryUrl(session.orderId);
    const completedReply = `Olá! O seu pedido já foi enviado para gravação em nosso estúdio! 🎶

👉 *Acompanhe seu pedido e ouça suas prévias no link:*
${deliveryUrl}

Se você quiser compor uma nova música para outra pessoa, basta digitar *REINICIAR* a qualquer momento! 💜`;

    await sendWApiTextMessage(cleanPhone, completedReply, envVars);
    return true;
  }

  return false;
}
