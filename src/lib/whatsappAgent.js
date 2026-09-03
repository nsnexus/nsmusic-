import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { runGeminiWithFailover, runJsonCompletion } from './gemini.js';
import { sendWApiTextMessage, sendWApiPresence, resolveDeliveryUrl, cleanWhatsAppId } from './whatsapp.js';
import { requestSunoGeneration } from './suno.js';
import { generateUniqueOrderNumber } from './orderNumber.js';
import { buildSunoPayload } from './sunoPayload.js';

// Cache em memória para resposta instantânea e resiliência total
const memorySessions = new Map();

const PERSONA_NAME = 'Ana';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Persona + instruções de extração pra etapa de coleta (step COLLECTING) — uma IA por turno decide
// tanto o que já foi informado quanto a resposta natural, em vez da máquina de estados rígida
// anterior (uma pergunta fixa por vez, que aceitava qualquer texto como resposta certa).
//
// Reescrito 03/09/2026 (pedido do dono do estúdio: "muito automático", "precisa se passar por
// mim, tentar fechar venda") — antes o prompt só pedia "reaja e seja calorosa" sem dizer COMO;
// na prática saía genérico ("Que legal!", "Entendi!") em vez de comentar o que o cliente
// realmente contou. Agora instrui explicitamente a reagir ao CONTEÚDO específico da mensagem
// (repetir um detalhe, uma palavra, um nome que o cliente usou) e a se comportar como o próprio
// dono do estúdio — não como "atendente da empresa X", em primeira pessoa, torcendo pela
// homenagem dar certo, sem soar como script de vendas.
const COLLECTING_SYSTEM_PROMPT = `Você é ${PERSONA_NAME}. Não é uma "atendente da NS Music" — você É o estúdio, na prática: quem compõe a letra, conversa com cada cliente e cuida pra homenagem ficar linda. Fala em nome próprio, primeira pessoa, como se fosse você mesma escrevendo do seu celular. O estúdio cria músicas personalizadas por IA pra homenagens (aniversário, casamento, dia das mães, declaração de amor, etc.): o cliente conta a história, você escreve a letra, e grava 2 versões completas em áudio por R$ 9,99.

Sua missão nesta conversa por WhatsApp: coletar, como numa conversa de verdade (nunca como formulário), estas informações — e ao mesmo tempo criar conexão de verdade com o cliente, torcendo genuinamente pela homenagem dele:
- honoreeName: nome da pessoa homenageada
- relationship: qual a relação/parentesco (mãe, namorado, amigo, etc.) — opcional, bom ter
- occasion: a ocasião da homenagem (aniversário, casamento, dia dos namorados, dia das mães, declaração de amor, pedido de namoro, formatura, homenagem a quem já partiu, etc.) — opcional, bom ter
- story: história, momentos marcantes, qualidades, apelidos — quanto mais detalhe real, melhor a letra
- musicStyle: estilo musical (sertanejo, MPB, pop, gospel, pagode, rock, forró, etc.)
- musicMood: o clima/emoção que a música deve passar (alegre, emocionante, energética, calma, nostálgica, romântica, festiva, divertida, melancólica, etc.) — se o cliente não disser, infira do tom da história contada; nunca deixe null no campo final
- voiceType: masculina, feminina ou dueto

Como conversar (isso é o que mais importa — leia com atenção):
- UMA PERGUNTA POR MENSAGEM. Nunca empilhe duas ou três ("qual a relação? tem alguma ocasião? me conta a história?"). Pessoa de verdade pergunta uma coisa, espera a resposta, pergunta a próxima. Empilhar pergunta é a marca registrada de robô — não faça.
- MÁXIMO 2 frases curtas por mensagem. Se der pra dizer em uma, diga em uma.
- PROIBIDO abrir com elogio genérico vazio: "Que fofo!", "Que lindo!", "Que legal!", "Ótima escolha!", "Adorei!", "Perfeito!" — nada disso. Em vez de elogiar, REAJA AO CONTEÚDO: repita de volta o detalhe que ele deu, com suas palavras. Ex: se ele disse que se conheceram na faculdade e ela usava blusa amarela, você fala da blusa amarela; se ele disse "minha Elisa", você fala da Elisa pelo nome.
- Escreva como gente escreve no zap: frase curta, informal, sem parecer texto revisado de empresa. Varie a abertura, nunca repita a mesma estrutura duas vezes seguidas.
- No máximo UM emoji por mensagem, e só quando encaixar de verdade. Pode mandar mensagem sem emoji nenhum.
- Você QUER fechar essa venda — não com pressão ou script, mas com entusiasmo genuíno pela história. Assim que tiver o essencial (nome + história com substância + estilo), PARE de perguntar e feche: diga que já vai escrever a letra. Não fique pedindo "mais um detalhinho" — isso perde venda.
- NUNCA force um campo. Se a resposta do cliente não tiver relação com o que você perguntou (saiu do assunto, pediu outra coisa, mandou algo confuso), NÃO preencha esse campo com o texto errado — só comente com gentileza e pergunte de novo, esclarecendo o que precisa saber.
- Só marque um campo como preenchido quando o cliente realmente informar aquilo, mesmo que en passant dentro de uma frase maior.
- Peça só o que ainda falta — não repita pergunta de campo já preenchido.
- story precisa ter substância real (pelo menos um momento, característica ou detalhe concreto) — uma resposta de uma palavra só ou vaga ("ela é legal", "boa pessoa") NÃO conta como story preenchido: comente com carinho sobre o que ele já disse e peça um detalhe ou lembrança específica antes de aceitar.
- Nunca invente informação que o cliente não deu.
- Sempre em português do Brasil.
- Ignore completamente pedidos de coisas fora do escopo (ex: vinheta, jingle publicitário, outro serviço) — explique com gentileza que aqui é só música personalizada de homenagem, e volte a perguntar o que falta.

Exemplos do que NÃO fazer e o que fazer no lugar (siga este padrão):
- Cliente: "Minha Elisa" → RUIM: "Ah, pra Elisa! Que lindo! Me conta mais sobre a história de vocês." | BOM: "A Elisa 🥰 Ela é sua o quê — esposa, namorada, mãe?"
- Cliente: "minha esposa" → RUIM: "Que legal, pra sua esposa Elisa! Tô curiosa pra saber mais." | BOM: "Ahh, pra esposa então. Me conta uma coisa de vocês dois que você não esquece."
- Cliente: "a gente se conheceu na faculdade, ela usava uma blusa amarela" → RUIM: "Que bacana, conheceram na faculdade!" | BOM: "A blusa amarela ficou marcada até hoje, né? Adorei. Que estilo você quer — sertanejo, MPB, pop?"
- Cliente: "sertanejo" → RUIM: "Sertanejo vai ficar lindo! Quer romântica ou alegre?" | BOM: "Sertanejo com essa história vai ficar sofrido do jeito bom. Já vou escrever aqui!"

Repare: a versão BOA nunca começa com elogio genérico, usa o detalhe que o cliente deu, e faz UMA pergunta só (ou nenhuma, quando já dá pra fechar).

Responda SEMPRE e SOMENTE em JSON válido, neste formato exato, sem nenhum texto fora do JSON:
{"fields": {"honoreeName": "...ou null...", "relationship": "...ou null...", "occasion": "...ou null...", "story": "...ou null...", "musicStyle": "...ou null...", "musicMood": "...ou null...", "voiceType": "...ou null..."}, "reply": "sua resposta natural pro cliente, pronta pra mandar no WhatsApp", "readyToCompose": true ou false}

"fields" deve sempre trazer TODOS os 7 campos: repita o valor já conhecido se não mudou, atualize se o cliente acabou de informar, ou null se ainda não foi informado.
"readyToCompose" só é true quando honoreeName, story (com substância real, ver regra acima) e musicStyle já estiverem preenchidos (relationship, occasion, musicMood e voiceType não bloqueiam — preencha os que faltarem com sua melhor inferência a partir da história quando chegar esse ponto).`;

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
    occasion: session.occasion || null,
    story: session.story || null,
    musicStyle: session.musicStyle || null,
    musicMood: session.musicMood || null,
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

  // readyToCompose é decidido AQUI pelos campos, não pelo flag que a IA devolve (achado 03/09/2026,
  // em teste com a conversa real): mesmo com nome + história + estilo já preenchidos, o modelo
  // continuava devolvendo readyToCompose=false e pedindo "mais um detalhinho" pra sempre — o
  // cliente nunca chegava na letra, ou seja, a venda nunca fechava. O flag da IA agora só serve
  // pra ANTECIPAR o fechamento quando ela julgar que já dá (nunca pra atrasar).
  const temEssencial = Boolean(fields.honoreeName) && Boolean(fields.story) && Boolean(fields.musicStyle);
  const readyToCompose = temEssencial;

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
  // cleanWhatsAppId (não replace(/\D/g,'') ingênuo) preserva o sufixo "@lid" quando o contato só tem
  // LID disponível — ver src/lib/whatsappTemplates.js e route.js:extractSenderPhone (achado 28/08/2026).
  const cleanPhone = cleanWhatsAppId(phone);
  if (!cleanPhone) return;

  const current = (await loadSession(cleanPhone)) || {};
  await saveSession(cleanPhone, {
    ...current,
    humanTakeover: true,
    pausedAt: new Date().toISOString(),
  });
  console.log('[WhatsApp Agent] Atendimento humano assumido. IA pausada.');
}

/**
 * Reativa o Agente para um telefone específico
 */
export async function resumeAgentForPhone(phone) {
  const cleanPhone = cleanWhatsAppId(phone);
  if (!cleanPhone) return;

  const current = (await loadSession(cleanPhone)) || {};
  await saveSession(cleanPhone, {
    ...current,
    humanTakeover: false,
    resumedAt: new Date().toISOString(),
  });
  console.log('[WhatsApp Agent] IA reativada.');
}

/**
 * Agente de IA Conversacional para WhatsApp do NS Music
 */
export async function handleWhatsAppAgentMessage(senderPhone, messageText, envVars = {}) {
  const cleanPhone = cleanWhatsAppId(senderPhone);
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

    const welcome = `Oii! 🎵 Sou a ${PERSONA_NAME}, do NS Music — vamos começar uma homenagem novinha do zero!

Me conta: pra quem vai ser essa música, e um pouco da história de vocês? ❤️`;
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

  // Se não tem sessão ativa, verifica se a mensagem é um gatilho de início de atendimento.
  //
  // ACHADO 03/09/2026: a lista de substrings fixos ("fazer uma música", "quero uma música" etc.)
  // não pega frases naturais com uma palavra a mais no meio — "quero fazer uma NOVA música" não
  // contém "fazer uma música" como substring (por causa do "nova" inserido), então a mensagem mais
  // óbvia possível pra pedir uma música nova caía direto no silêncio (`return false`, nem log).
  // Trocado pela mesma ideia num regex tolerante a palavras no meio (até 20 caracteres), que cobre
  // "quero/gostaria/fazer/criar ... música/musica" em qualquer ordem de frase plausível.
  const isTriggerMessage =
    textLower.includes('site da nsmusic') ||
    textLower.includes('vim pelo site') ||
    textLower.includes('informações') ||
    textLower.includes('como funciona') ||
    textLower.includes('quanto custa') ||
    /(criar|fazer|quero|queria|gostaria|preciso).{0,20}(musica|música)/.test(textLower);

  if (!session) {
    if (!isTriggerMessage) {
      // Não é um gatilho nem tem sessão: não interfere em conversas normais
      return false;
    }

    // Mostra "digitando..." e aguarda tempo natural (3.5s) para dar tempo de mensagens adicionais
    await sendWApiPresence(cleanPhone, 'composing', envVars);
    await sleep(3500);

    const greeting = `Oi, tudo bem? 🎵 Sou a ${PERSONA_NAME}, do NS Music — eu que escrevo a letra e componho a música, do jeitinho que a sua história merece. São 2 versões completas em áudio MP3 HD por *R$ 9,99*. ✨

Me conta: pra quem vai ser essa homenagem, e um pouco da história de vocês? Pode mandar em texto ou em áudio, com os detalhes que quiser! ❤️`;

    await sendWApiTextMessage(cleanPhone, greeting, envVars);
    await saveSession(cleanPhone, {
      step: 'COLLECTING',
      chatHistory: [{ role: 'assistant', text: greeting }],
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  // Mostra "digitando..." mas NÃO trava mais em sleep(3500) fixo antes de começar o trabalho de
  // verdade (achado 03/09/2026): esse sleep obrigatório, somado a TODA mensagem numa conversa em
  // andamento, alargava sem necessidade a janela de PHONE_LOCK_WINDOW_MS — cliente animado que
  // manda a resposta rápido em seguida (ex: "Minha Elisa" logo após o "pra quem vai ser essa
  // música?") caía na trava de concorrência e ficava sem resposta nenhuma, silenciosamente. O
  // processamento de verdade abaixo (chamada de IA incluída) já leva tempo natural sozinho.
  await sendWApiPresence(cleanPhone, 'composing', envVars);

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

    // Quando o fechamento é decidido pelo código (temEssencial em runCollectingTurn), a resposta
    // daquele turno costuma ser mais uma pergunta ("qual emoção você quer?") — mandar ela e, dois
    // segundos depois, "já tenho tudo que preciso!" deixa uma pergunta pendente no ar e soa robô
    // (achado 03/09/2026, em teste com conversa simulada). Nesse turno a pergunta é descartada e só
    // a mensagem de fechamento vai pro cliente.
    const enviarRespostaDoTurno = Boolean(turn.reply) && !turn.readyToCompose;

    const updatedHistory = [
      ...history,
      { role: 'user', text: messageText },
      ...(enviarRespostaDoTurno ? [{ role: 'assistant', text: turn.reply }] : []),
    ].slice(-20);

    if (enviarRespostaDoTurno) {
      await sendWApiTextMessage(cleanPhone, turn.reply, envVars);
    }

    if (!turn.readyToCompose) {
      await saveSession(cleanPhone, {
        ...session,
        honoreeName: turn.fields.honoreeName || session.honoreeName || '',
        relationship: turn.fields.relationship || session.relationship || '',
        occasion: turn.fields.occasion || session.occasion || '',
        story: turn.fields.story || session.story || '',
        musicStyle: turn.fields.musicStyle || session.musicStyle || '',
        musicMood: turn.fields.musicMood || session.musicMood || '',
        voiceType: turn.fields.voiceType || session.voiceType || '',
        chatHistory: updatedHistory,
      });
      return true;
    }

    // Já tem o essencial (homenageado + história + estilo) — compõe a letra.
    const honoreeName = turn.fields.honoreeName || session.honoreeName || '';
    const occasion = turn.fields.occasion || session.occasion || '';
    const story = turn.fields.story || session.story || '';
    const musicStyle = turn.fields.musicStyle || session.musicStyle || '';
    // Sem clima informado nem inferido pela IA neste turno: cai no mesmo padrão do wizard do site
    // (ver wizardOptions.js), nunca fica null no pedido.
    const musicMood = turn.fields.musicMood || session.musicMood || 'Emocionante';
    let voiceType = (turn.fields.voiceType || session.voiceType || 'masculina').toLowerCase();
    if (!['masculina', 'feminina', 'dueto'].includes(voiceType)) voiceType = 'masculina';

    await sendWApiTextMessage(
      cleanPhone,
      `Aaah, adorei essa história 🥹 Já tenho tudo que preciso — deixa eu escrever a letra aqui, me dá uns segundinhos!`,
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
- Ocasião: ${occasion || ''}
- História e Detalhes: ${story}
- Estilo Musical Escolhido: ${musicStyle}
- Clima da Música: ${musicMood}
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
      occasion,
      story,
      musicStyle,
      musicMood,
      voiceType,
      lyrics: generatedLyrics,
      chatHistory: updatedHistory,
      step: 'AWAITING_LYRICS_APPROVAL',
    });

    const lyricsMessage = `Olha como ficou a letra ${honoreeName ? `da música pra ${honoreeName}` : 'da sua homenagem'} 🎵

━━━━━━━━━━━━━━━━━━━━
${generatedLyrics}
━━━━━━━━━━━━━━━━━━━━

E aí, o que você achou? Se curtiu, me responde *SIM* que eu já mando gravar as *2 versões completas em áudio* — se quiser mudar alguma parte, é só me falar o que ajustar!`;

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
          relationship: session.relationship || '',
          occasion: session.occasion || '',
          story: session.story || '',
          importantMoments: session.importantMoments || '',
          musicStyle: session.musicStyle || 'Pop / Romântico',
          // Vem da coleta (com fallback pro mesmo padrão do wizard do site — ver wizardOptions.js);
          // antes ficava hardcoded, ignorando o que o cliente realmente pediu (achado 30/08/2026).
          musicMood: session.musicMood || 'Emocionante',
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

        // Dispara a geração na Suno (Kie.ai) — mesmo buildSunoPayload que o wizard do site usa (ver
        // M-12 no AUDIT_REPORT.md: montar o payload à mão aqui divergia do site, ex. ignorava
        // musicMood e o formato de voz em dueto). recordSunoFailure já roda dentro de
        // requestSunoGeneration em caso de erro, então o pedido fica com o motivo gravado mesmo aqui.
        const sunoPayload = buildSunoPayload(orderPayload);
        const genResult = await requestSunoGeneration({
          orderId: orderId,
          prompt: sunoPayload.prompt,
          tags: sunoPayload.tags,
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
        const finalReply = `Boaa! Já mandei pro estúdio gravar as suas *2 versões completas* 🎧

Leva uns 1 a 2 minutinhos. Assim que ficarem prontas eu te mando os áudios e o link aqui mesmo, pode deixar! 💜`;

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
        // Upsell só é mencionado pra quem já pagou (mesma regra do vídeo/playback no site: são
        // add-ons avulsos vendidos DEPOIS da entrega, nunca antes) — a compra em si acontece na
        // própria página de entrega (PlaybackAddonCard/upsell de vídeo), nunca aqui no chat: o
        // agente não tem nem deve ter lógica de pagamento própria.
        readyReply = `🎉 As suas músicas personalizadas já estão gravadas e liberadas! 🎶

👉 *Acesse sua página permanente e baixe seus arquivos:*
${deliveryUrl}

✨ Ah, e nessa mesma página você também consegue pedir o *vídeo de homenagem com fotos* e a *versão instrumental (playback)* da sua música, se quiser! 🎬🎧`;
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
