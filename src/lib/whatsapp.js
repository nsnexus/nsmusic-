import { getRequestContext } from '@cloudflare/next-on-pages';
import { DOMINIO_CANONICO } from './siteUrl.js';
import { resolveDeliveryUrl, resolveCriarUrl, formatToWhatsAppNumber, cleanWhatsAppId, buildAudioDownloadLink } from './whatsappTemplates.js';

export { resolveDeliveryUrl, resolveCriarUrl, formatToWhatsAppNumber, cleanWhatsAppId, buildAudioDownloadLink };

const WAPI_BASE_URL = 'https://api.w-api.app/v1';

// Memória local de processos Edge para proteção anti-rajada e anti-spam imediata
const inMemoryPhoneMessageLocks = new Map();
const inMemoryPaymentConfirmedLocks = new Map();
const PAYMENT_CONFIRMED_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos de proteção por cliente
const GENERAL_DUPLICATE_COOLDOWN_MS = 30 * 1000; // 30 segundos para a mesma mensagem exata

/**
 * Identifica se a execução atual é de teste unitário ou se o número é fictício/mock de teste.
 * NUNCA permite disparo de rede real para a W-API ou Evolution API durante testes.
 */
export function isTestOrMockPhone(phone) {
  if (
    process.env.NODE_ENV === 'test' ||
    process.env.VITEST ||
    Boolean(process.env.CI) ||
    process.env.IS_TEST === 'true'
  ) {
    return true;
  }
  const clean = String(phone || '').replace(/\D/g, '');
  if (!clean || clean === '5511999998888' || clean === '5511998887777' || clean.includes('999998888')) {
    return true;
  }
  return false;
}

/**
 * Trava central de deduplicação e limite de taxa de disparos para WhatsApp.
 * Protege contra envio em loop, rajadas concorrentes de múltiplos workers e testes automatizados.
 */
export async function shouldBlockWhatsAppMessage(phone, message, env = {}) {
  if (isTestOrMockPhone(phone)) {
    console.log(`[WhatsApp Guard] Bloqueado disparo para ambiente ou telefone de teste: ${phone}`);
    return { block: true, reason: 'test_environment_or_mock_number' };
  }

  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const now = Date.now();
  const isPaymentMsg = /pagamento.*(?:confirmado|aprovado|caiu)|🎉.*pagamento/i.test(message);

  if (isPaymentMsg) {
    const lastSentPayment = inMemoryPaymentConfirmedLocks.get(cleanPhone);
    if (lastSentPayment && (now - lastSentPayment < PAYMENT_CONFIRMED_COOLDOWN_MS)) {
      console.warn(`[WhatsApp Anti-Spam] Mensagem de confirmação de pagamento para ${cleanPhone} descartada (cooldown de 15min ativo, enviado há ${Math.round((now - lastSentPayment) / 1000)}s).`);
      return { block: true, reason: 'payment_confirmed_cooldown' };
    }
    // Trava imediatamente na memória de forma síncrona
    inMemoryPaymentConfirmedLocks.set(cleanPhone, now);

    // Trava distribuída na tabela config do Supabase (para proteger entre múltiplos workers da Cloudflare)
    try {
      const { getSupabaseEdge } = await import('./supabase-edge.js');
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        const lockKey = `lock_payment_sent_${cleanPhone}`;
        const { data: existingLock } = await supabase.from('config').select('valor').eq('chave', lockKey).maybeSingle();
        if (existingLock?.valor?.at) {
          const sentAt = Date.parse(existingLock.valor.at);
          if (!Number.isNaN(sentAt) && (now - sentAt < PAYMENT_CONFIRMED_COOLDOWN_MS)) {
            console.warn(`[WhatsApp Anti-Spam] Trava distribuída ativa no Supabase para ${cleanPhone}. Descartando disparo repetido.`);
            return { block: true, reason: 'payment_confirmed_distributed_lock' };
          }
        }
        await supabase.from('config').upsert({
          chave: lockKey,
          valor: { at: new Date().toISOString() },
          updated_at: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('[WhatsApp Anti-Spam] Erro ao verificar trava distribuída em config:', e.message);
    }
  } else {
    // Para mensagens comuns, descarta se a exata mesma mensagem foi enviada ao mesmo número há menos de 30s
    const hash = `${cleanPhone}:${String(message).slice(0, 60)}`;
    const lastSentGeneral = inMemoryPhoneMessageLocks.get(hash);
    if (lastSentGeneral && (now - lastSentGeneral < GENERAL_DUPLICATE_COOLDOWN_MS)) {
      console.warn(`[WhatsApp Anti-Spam] Mensagem idêntica para ${cleanPhone} descartada (enviada há ${Math.round((now - lastSentGeneral) / 1000)}s).`);
      return { block: true, reason: 'duplicate_message_cooldown' };
    }
    inMemoryPhoneMessageLocks.set(hash, now);
  }

  return { block: false };
}

export const getEvolutionConfig = (env = {}) => {
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  const baseUrl = (env.EVOLUTION_API_URL || ctxEnv.EVOLUTION_API_URL || process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
  const instanceName = env.EVOLUTION_INSTANCE_NAME || ctxEnv.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE_NAME || '';
  const token = env.EVOLUTION_API_KEY || ctxEnv.EVOLUTION_API_KEY || process.env.EVOLUTION_API_KEY || '';

  return { baseUrl, instanceName, token, enabled: Boolean(baseUrl && instanceName && token) };
};

export const getWApiConfig = (env = {}) => {
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  const instanceId = env.WAPI_INSTANCE_ID || ctxEnv.WAPI_INSTANCE_ID || process.env.WAPI_INSTANCE_ID || '';
  const token = env.WAPI_TOKEN || ctxEnv.WAPI_TOKEN || process.env.WAPI_TOKEN || '';

  return { instanceId, token, baseUrl: WAPI_BASE_URL };
};

/**
 * Simula status de presença ("composing" = digitando..., "recording" = gravando áudio...)
 */
export const sendWApiPresence = async (phone, presence = 'composing', env = {}) => {
  if (isTestOrMockPhone(phone)) return;
  const formattedNumber = formatToWhatsAppNumber(phone);
  if (!formattedNumber) return;

  // 1. Tenta Evolution API (VPS)
  const evoConfig = getEvolutionConfig(env);
  if (evoConfig.enabled) {
    try {
      await fetch(`${evoConfig.baseUrl}/chat/sendPresence/${evoConfig.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': evoConfig.token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: formattedNumber,
          presence: presence,
          delay: 1200,
        }),
        signal: AbortSignal.timeout(4000),
      }).catch(() => {});
    } catch (e) {}
    return;
  }

  // 2. Fallback W-API
  const { instanceId, token, baseUrl } = getWApiConfig(env);
  if (!instanceId || !token) return;

  try {
    await fetch(`${baseUrl}/chat/send-presence?instanceId=${instanceId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedNumber,
        presence: presence,
        delay: 1200,
      }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  } catch (e) {}
};

/**
 * Envia uma mensagem de texto via Evolution API (VPS própria)
 */
export const sendEvolutionTextMessage = async (phone, message, env = {}) => {
  if (isTestOrMockPhone(phone)) {
    return { success: true, mocked: true };
  }

  const { baseUrl, instanceName, token, enabled } = getEvolutionConfig(env);
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber || !enabled) {
    return { success: false, error: 'Evolution API não configurado ou número inválido.' };
  }

  const numbersToSend = [formattedNumber];
  if (formattedNumber.startsWith('55') && formattedNumber.length === 13 && formattedNumber[4] === '9') {
    const withoutNine = `${formattedNumber.substring(0, 4)}${formattedNumber.substring(5)}`;
    numbersToSend.push(withoutNine);
  }

  let lastError = '';
  for (let i = 0; i < numbersToSend.length; i++) {
    const num = numbersToSend[i];
    try {
      console.log(`[Evolution API] Enviando mensagem (variante ${i + 1}/${numbersToSend.length})...`);
      const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number: num,
          text: message,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        console.log('[Evolution API] ✅ Mensagem enviada com sucesso pela VPS.');
        return { success: true, provider: 'evolution', phoneUsed: num };
      }

      const errData = await res.json().catch(() => ({}));
      lastError = JSON.stringify(errData?.response?.message || errData?.message || `HTTP ${res.status}`);
      console.error(`[Evolution API] Erro ao enviar (variante ${i + 1}):`, res.status, lastError);
    } catch (err) {
      lastError = err.message;
      console.error(`[Evolution API] Falha de rede (variante ${i + 1}):`, err.message);
    }
  }

  return { success: false, error: lastError };
};

/**
 * Envia mensagem de texto com prioridade na Evolution API (VPS) e fallback para W-API
 */
export const sendWApiTextMessage = async (phone, message, env = {}) => {
  const formattedNumber = formatToWhatsAppNumber(phone);
  if (!formattedNumber) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }

  // Trava central anti-spam / anti-loop / ambiente de teste
  const guard = await shouldBlockWhatsAppMessage(phone, message, env);
  if (guard.block) {
    return { success: true, ignored: guard.reason, phoneUsed: formattedNumber };
  }

  // 1. Tenta Evolution API (VPS própria) primeiro se configurada
  const evoConfig = getEvolutionConfig(env);
  if (evoConfig.enabled) {
    const evoResult = await sendEvolutionTextMessage(phone, message, env);
    if (evoResult.success) {
      return evoResult;
    }
    console.warn('[WhatsApp] Falha no envio via Evolution API VPS. Acionando fallback W-API...', evoResult.error);
  }

  // 2. Fallback W-API
  const { instanceId, token, baseUrl } = getWApiConfig(env);
  if (!instanceId || !token) {
    return { success: false, error: 'Nenhum provedor WhatsApp ativo (Evolution / W-API não configurados).' };
  }

  const numbersToSend = [formattedNumber];
  if (formattedNumber.startsWith('55') && formattedNumber.length === 13 && formattedNumber[4] === '9') {
    const withoutNine = `${formattedNumber.substring(0, 4)}${formattedNumber.substring(5)}`;
    numbersToSend.push(withoutNine);
  }

  let lastError = '';
  for (let i = 0; i < numbersToSend.length; i++) {
    const num = numbersToSend[i];
    try {
      console.log(`[W-API] Enviando mensagem (variante ${i + 1}/${numbersToSend.length})...`);
      const res = await fetch(`${baseUrl}/message/send-text?instanceId=${instanceId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: num,
          message: message,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        console.log('[W-API] ✅ Mensagem enviada com sucesso.');
        return { success: true, phoneUsed: num };
      }

      const errData = await res.json().catch(() => ({}));
      lastError = errData?.message || `HTTP ${res.status}`;
      console.error(`[W-API] Erro ao enviar (variante ${i + 1}):`, res.status, lastError);
    } catch (error) {
      lastError = error.message;
      console.error(`[W-API] Erro de rede ao enviar (variante ${i + 1}):`, error.message);
    }
  }

  return { success: false, error: lastError };
};

/**
 * Envia a mensagem de "música pronta" avisando que as 2 versões ficaram prontas com o link de entrega.
 */
export const sendMusicReadyTemplate = async (phone, { customerName, honoreeName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || DOMINIO_CANONICO;

  const message = `🎵 *Olá, ${name}!*

A sua música personalizada para *${honoree}* já foi produzida com sucesso no estúdio *NS Music*! 🎧

Foram gravadas *2 versões exclusivas* com arranjos diferentes para você escolher ou ficar com as duas.

👉 *Ouça a prévia agora mesmo:*
${url}

Se precisar de qualquer ajuda ou tiver dúvidas, é só me responder por aqui! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Verifica se o pedido inclui acesso ao Vídeo Homenagem em qualquer uma das propriedades possíveis
 */
export const isVideoPurchased = (orderData = {}) => {
  if (!orderData) return false;
  return Boolean(
    orderData.hasVideoAccess ||
    orderData.videoAddonPaid ||
    orderData.paymentIntentSku === 'combo' ||
    orderData.paymentIntentSku === 'video_addon' ||
    orderData.addons?.wantsVideo ||
    orderData.selectedPackage === 'combo' ||
    orderData.includeVideo
  );
};

/**
 * Envia mensagem de confirmação de pagamento aprovado com links diretos de áudio e oferta do vídeo homenagem.
 */
export const sendPaymentApprovedTemplate = async (phone, { customerName, honoreeName, deliveryUrl, audioUrls, hasVideoAccess, orderData }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || DOMINIO_CANONICO;

  const userHasVideo = Boolean(hasVideoAccess || isVideoPurchased(orderData));

  let audiosList = '';
  if (Array.isArray(audioUrls) && audioUrls.length > 0) {
    audiosList = audioUrls
      .filter(Boolean)
      .map((link, idx) => `• *Versão ${idx + 1}:* ${buildAudioDownloadLink(link, `NS-Music-${honoree}-Versao-${idx + 1}.mp3`)}`)
      .join('\n');
  }

  const videoBlock = userHasVideo
    ? `━━━━━━━━━━━━━━━━━━━━
🎬 Seu *vídeo homenagem* também já está liberado! Pra gerar, é só enviar de 10 a 20 fotos na sua página de entrega (mesmo link acima) que a gente sincroniza tudo com a música. 📸
━━━━━━━━━━━━━━━━━━━━

`
    : `━━━━━━━━━━━━━━━━━━━━
🎬 *QUE TAL UM VÍDEO HOMENAGEM?*
Transforme essa música linda em um *vídeo com fotos e legendas sincronizadas* para emocionar ainda mais ${honoree}!

✨ *Adicione o vídeo ao seu pedido por apenas R$ 6,90:*
${url}
━━━━━━━━━━━━━━━━━━━━

`;

  const message = `🎉 *PAGAMENTO CONFIRMADO!*

Olá, ${name}! As músicas personalizadas para *${honoree}* já estão 100% liberadas em alta definição (MP3 HD)! 🎶

${audiosList ? `📥 *Baixe seus áudios diretamente:*\n${audiosList}\n\n` : ''}🔗 *Acesse sua página de entrega permanente:*
${url}

${videoBlock}Muito obrigado por escolher o *NS Music* para fazer parte desse momento tão especial! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Envia mensagem de recuperação de carrinho.
 */
export const sendRecoveryTemplate = async (phone, templateName, { customerName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const url = deliveryUrl || DOMINIO_CANONICO;

  const is24h = templateName?.includes('24h');
  const discountText = is24h ? 'com *desconto especial por tempo limitado*' : 'aguardando por você';

  const message = `Oi, ${name}! Passando para avisar que a prévia da sua música personalizada ainda está ${discountText}! 🎶

Não perca essa homenagem emocionante:
👉 ${url}

Qualquer dúvida, estamos por aqui! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Lembrete de prévia não ouvida
 */
export const sendPreviewNudgeTemplate = async (phone, { customerName, honoreeName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || DOMINIO_CANONICO;

  const message = `Olá, ${name}! 👋

Percebemos que sua música personalizada para *${honoree}* já ficou pronta, mas você ainda não conseguiu ouvir a prévia — às vezes a página demora alguns segundos pra carregar. 🎶

👉 *Clique aqui e ouça agora:*
${url}

Qualquer dificuldade, é só me chamar por aqui! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Envia texto livre
 */
export const sendFreeTextReply = async (phone, message, env = {}) => {
  return await sendWApiTextMessage(phone, message, env);
};
