import { doc, getDoc, setDoc, deleteDoc, addDoc, collection } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';
import { runGeminiWithFailover } from './gemini';
import { sendWApiTextMessage, resolveDeliveryUrl } from './whatsapp';
import { requestSunoGeneration } from './suno';
import { generateUniqueOrderNumber } from './orderNumber';

/**
 * Agente de IA Conversacional para WhatsApp do NS Music
 * Guia o cliente passo a passo desde a ideia até a composição da letra e geração da música na Suno.
 */
export async function handleWhatsAppAgentMessage(senderPhone, messageText, envVars = {}) {
  const cleanPhone = String(senderPhone || '').replace(/\D/g, '');
  if (!cleanPhone || cleanPhone.length < 8) return false;

  const textLower = (messageText || '').trim().toLowerCase();
  const sessionRef = doc(db, 'orders', `session_${cleanPhone}`);

  // 1. Comando de reinício
  if (['reiniciar', 'começar de novo', 'comecar de novo', 'novo pedido', 'cancelar', 'menu'].includes(textLower)) {
    try {
      await deleteDoc(sessionRef);
    } catch (e) {}
    const welcome = `🎵 *NS Music — Novo Atendimento*

Vamos começar uma nova música personalizada do zero! 🎧

Para quem é essa linda homenagem e qual é o *nome* dessa pessoa especial? ❤️`;
    await sendWApiTextMessage(cleanPhone, welcome, envVars);
    await setDoc(sessionRef, {
      step: 'AWAITING_HONOREE',
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  // 2. Carrega sessão atual
  let session = null;
  try {
    const snap = await getDoc(sessionRef);
    if (snap.exists()) {
      session = snap.data();
    }
  } catch (e) {
    console.warn('[WhatsApp Agent] Erro ao carregar sessão:', e.message);
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

    // Inicia nova sessão
    const greeting = `🎵 *Olá! Seja muito bem-vindo(a) ao NS Music!* 🎧

Eu sou a assistente de composição do *NS Music* e vou te ajudar a criar uma música personalizada inesquecível gravada em estúdio profissional!

A gente escreve a letra exclusiva da sua história e nosso estúdio grava 2 versões completas em áudio MP3 HD por apenas *R$ 9,99*. ✨

Para começarmos, me diga:
👉 *Para quem é essa homenagem* (ex: mãe, namorado, esposa, pai, filho, amiga...) e qual é o *nome* dessa pessoa especial?`;

    await sendWApiTextMessage(cleanPhone, greeting, envVars);
    await setDoc(sessionRef, {
      step: 'AWAITING_HONOREE',
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return true;
  }

  // 3. Máquina de Estados da Conversa
  const currentStep = session.step || 'AWAITING_HONOREE';

  // --- ETAPA 1: RECEBE NOME DO HOMENAGEADO E PARENTESCO ---
  if (currentStep === 'AWAITING_HONOREE') {
    const honoreeText = messageText.trim();
    
    await setDoc(sessionRef, {
      ...session,
      honoreeName: honoreeText,
      step: 'AWAITING_STORY',
      updatedAt: new Date().toISOString(),
    });

    const reply = `Que maravilha! Uma homenagem para *${honoreeText}* vai ser emocionante! ❤️

Agora, me conte um pouco sobre a história de vocês:
• Como se conheceram ou momentos marcantes que viveram juntos?
• Quais qualidades ou manias você mais admira nele(a)?
• Tem algum apelido carinhoso, frase especial ou lembrança que você quer na letra?

_(Pode escrever do seu jeito, com quantos detalhes quiser! Quanto mais detalhes, mais emocionante fica a canção.)_ ✨`;

    await sendWApiTextMessage(cleanPhone, reply, envVars);
    return true;
  }

  // --- ETAPA 2: RECEBE A HISTÓRIA E MOMENTOS MARCANTES ---
  if (currentStep === 'AWAITING_STORY') {
    const storyText = messageText.trim();

    await setDoc(sessionRef, {
      ...session,
      story: storyText,
      step: 'AWAITING_STYLE',
      updatedAt: new Date().toISOString(),
    });

    const reply = `Nossa, que história linda! Já estou super inspirada para compor essa homenagem! 🎶

Agora, escolha o *estilo musical* e o *tipo de voz* que mais combinam com essa pessoa:

🎸 *Estilos mais pedidos:*
1️⃣ Sertanejo
2️⃣ MPB / Acústico
3️⃣ Pop / Romântico
4️⃣ Gospel / Louvor
5️⃣ Pagode / Samba
6️⃣ Rock / Pop Rock
7️⃣ Forró

🎙️ *Tipo de Voz:* Masculina, Feminina ou Dueto?

_(Basta responder com o estilo e a voz desejada, ex: "Sertanejo com voz masculina")_`;

    await sendWApiTextMessage(cleanPhone, reply, envVars);
    return true;
  }

  // --- ETAPA 3: RECEBE ESTILO, COMPÕE A LETRA E ENVIA ---
  if (currentStep === 'AWAITING_STYLE') {
    const styleText = messageText.trim();
    let detectedVoice = 'masculina';
    if (styleText.toLowerCase().includes('feminina') || styleText.toLowerCase().includes('mulher')) {
      detectedVoice = 'feminina';
    } else if (styleText.toLowerCase().includes('dueto')) {
      detectedVoice = 'dueto';
    }

    // Feedback imediato para o usuário não ficar esperando no vácuo
    await sendWApiTextMessage(
      cleanPhone,
      `✍️ *Perfeito! Nossos compositores e nossa IA estão compondo os versos da sua canção agora mesmo... Aguarde só alguns segundos!* ⏳`,
      envVars
    );

    // Constrói prompt para a IA
    const prompt = `Você é um compositor e letrista profissional premiado de música brasileira.
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
- Homenageado(a): ${session.honoreeName || 'Pessoa Especial'}
- História e Detalhes: ${session.story || ''}
- Estilo Musical Escolhido: ${styleText}
- Tipo de Voz: ${detectedVoice}

RETORNE EXCLUSIVAMENTE O TEXTO DA LETRA DA MÚSICA, sem saudações ou comentários.`;

    let generatedLyrics = '';
    try {
      generatedLyrics = await runGeminiWithFailover(prompt);
    } catch (err) {
      console.error('[WhatsApp Agent] Erro ao compor letra:', err.message);
    }

    if (!generatedLyrics || generatedLyrics.length < 50) {
      await sendWApiTextMessage(
        cleanPhone,
        `Tivemos uma pequena instabilidade momentânea ao gerar a letra. Por favor, envie o estilo novamente para tentarmos de novo! 💜`,
        envVars
      );
      return true;
    }

    await setDoc(sessionRef, {
      ...session,
      musicStyle: styleText,
      voiceType: detectedVoice,
      lyrics: generatedLyrics,
      step: 'AWAITING_LYRICS_APPROVAL',
      updatedAt: new Date().toISOString(),
    });

    const lyricsMessage = `🎵 *Aqui está a letra exclusiva que compus para ${session.honoreeName || 'sua homenagem'}:*

━━━━━━━━━━━━━━━━━━━━
${generatedLyrics}
━━━━━━━━━━━━━━━━━━━━

O que você achou dessa letra? Quer que nosso estúdio grave as *2 versões musicais completas em alta definição* agora mesmo? 🎧

👉 Responda *SIM* para gravar, ou me diga o que gostaria de alterar na letra!`;

    await sendWApiTextMessage(cleanPhone, lyricsMessage, envVars);
    return true;
  }

  // --- ETAPA 4: APROVAÇÃO DA LETRA OU AJUSTES ---
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

      await setDoc(sessionRef, {
        ...session,
        orderId,
        step: 'COMPLETED',
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
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

      await setDoc(sessionRef, {
        ...session,
        lyrics: revisedLyrics,
        updatedAt: new Date().toISOString(),
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

  // --- ETAPA 5: PEDIDO CONCLUÍDO ---
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
