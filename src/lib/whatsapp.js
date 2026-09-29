import { getRequestContext } from '@cloudflare/next-on-pages';
import { DOMINIO_CANONICO } from './siteUrl.js';
import { resolveDeliveryUrl, resolveCriarUrl, formatToWhatsAppNumber, cleanWhatsAppId, buildAudioDownloadLink } from './whatsappTemplates.js';
import { enviarMusicaProntaCloud, enviarPagamentoConfirmadoCloud, getCloudApiConfig } from './whatsappCloudApi.js';

export { resolveDeliveryUrl, resolveCriarUrl, formatToWhatsAppNumber, cleanWhatsAppId, buildAudioDownloadLink };

// Memória local de processos Edge para proteção anti-rajada e anti-spam imediata
const inMemoryPhoneMessageLocks = new Map();
const inMemoryPaymentConfirmedLocks = new Map();
const PAYMENT_CONFIRMED_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutos de proteção por cliente
const GENERAL_DUPLICATE_COOLDOWN_MS = 30 * 1000; // 30 segundos para a mesma mensagem exata

/**
 * Identifica se a execução atual é de teste unitário ou se o número é fictício/mock de teste.
 * NUNCA permite disparo de rede real para o WhatsApp durante testes.
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

/**
 * Simula status de presença ("composing" = digitando..., "recording" = gravando áudio...) via Evolution API
 */
export const sendWhatsAppPresence = async (phone, presence = 'composing', env = {}) => {
  if (isTestOrMockPhone(phone)) return;
  const formattedNumber = formatToWhatsAppNumber(phone);
  if (!formattedNumber) return;

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
  }
};

export const sendWApiPresence = sendWhatsAppPresence;

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
 * Envia mensagem de texto via Evolution API (VPS própria)
 */
export const sendWhatsAppTextMessage = async (phone, message, env = {}) => {
  const formattedNumber = formatToWhatsAppNumber(phone);
  if (!formattedNumber) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }

  // Trava central anti-spam / anti-loop / ambiente de teste
  const guard = await shouldBlockWhatsAppMessage(phone, message, env);
  if (guard.block) {
    return { success: true, ignored: guard.reason, phoneUsed: formattedNumber };
  }

  const evoConfig = getEvolutionConfig(env);
  if (!evoConfig.enabled) {
    return { success: false, error: 'Evolution API não configurado na VPS.' };
  }

  return await sendEvolutionTextMessage(phone, message, env);
};

export const sendWApiTextMessage = sendWhatsAppTextMessage;
export const sendTextMessage = sendWhatsAppTextMessage;

/**
 * Último recurso de envio: a API oficial da Meta (Cloud API).
 *
 * Vale só para as duas mensagens que não podem faltar — "música pronta" e "pagamento confirmado" —
 * porque são as que envolvem produto entregue e dinheiro recebido. O número da Evolution já foi
 * suspenso duas vezes; quando isso acontece, quem pagou fica sem receber nada e sem saber por quê.
 *
 * Não é migração: a Evolution continua sendo o canal que conversa com o cliente. Aqui só sai
 * template aprovado, porque a Meta não deixa a empresa iniciar conversa com texto livre.
 *
 * @param {object} resultado o resultado da tentativa pelos provedores principais
 * @param {() => Promise<object>} enviar função que dispara o template correspondente
 */
const comFallbackCloudApi = async (resultado, enviar, env = {}) => {
  // Sucesso ou bloqueio proposital (teste, anti-spam, anti-loop) não acionam a reserva — repetir
  // pela Meta uma mensagem que a trava acabou de barrar recriaria exatamente o spam que ela evita.
  if (resultado?.success) return resultado;
  if (!getCloudApiConfig(env).enabled) return resultado;

  console.warn('[WhatsApp] Evolution falhou. Acionando Cloud API (Meta)...', resultado?.error);
  const cloud = await enviar();
  if (cloud.success) return cloud;

  return { success: false, error: `${resultado?.error || 'falha nos provedores principais'} | cloud_api: ${cloud.error}` };
};

/** Primeiro nome, porque nenhum template da Meta fica bem com nome completo. */
const primeiroNome = (nome) => String(nome || '').trim().split(/\s+/)[0] || 'Cliente';

/**
 * Envia a mensagem de "música pronta" avisando que as 2 versões ficaram prontas com o link de entrega.
 * Disparado EXCLUSIVAMENTE via API Oficial da Meta (WhatsApp Cloud API).
 */
export const sendMusicReadyTemplate = async (phone, { customerName, honoreeName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || DOMINIO_CANONICO;

  // Trava anti-spam / teste / duplicação
  const guard = await shouldBlockWhatsAppMessage(phone, `musica_pronta_${url}`, env);
  if (guard.block) {
    return { success: true, ignored: guard.reason, phoneUsed: formatToWhatsAppNumber(phone) };
  }

  const cloudConfig = getCloudApiConfig(env);
  if (cloudConfig.enabled) {
    console.log(`[WhatsApp] Enviando template de música pronta via Meta Cloud API Oficial para ${phone}...`);
    const res = await enviarMusicaProntaCloud(phone, { cliente: primeiroNome(name), homenageado: honoree, link: url }, env);
    if (res.success) return res;
    return { success: false, error: `cloud_api: ${res.error}` };
  }

  return { success: false, error: 'Cloud API não configurada (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' };
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
 * Disparado EXCLUSIVAMENTE via API Oficial da Meta (WhatsApp Cloud API).
 */
export const sendPaymentApprovedTemplate = async (phone, { customerName, honoreeName, deliveryUrl, audioUrls, hasVideoAccess, orderData }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || DOMINIO_CANONICO;

  // Trava anti-spam / cooldown de 15min para confirmação de pagamento
  const guard = await shouldBlockWhatsAppMessage(phone, 'pagamento aprovado', env);
  if (guard.block) {
    return { success: true, ignored: guard.reason, phoneUsed: formatToWhatsAppNumber(phone) };
  }

  const urls = Array.isArray(audioUrls) ? audioUrls.filter(Boolean) : [];
  const v1 = urls[0] ? buildAudioDownloadLink(urls[0], `NS-Music-${honoree}-Versao-1.mp3`) : url;
  const v2 = urls[1] ? buildAudioDownloadLink(urls[1], `NS-Music-${honoree}-Versao-2.mp3`) : v1;
  const orderId = orderData?.id || orderData?.orderNumber || (url.match(/orderId=([^&]+)/)?.[1]) || '';

  const cloudConfig = getCloudApiConfig(env);
  if (cloudConfig.enabled) {
    console.log(`[WhatsApp] Enviando template de pagamento aprovado via Meta Cloud API Oficial para ${phone}...`);
    const res = await enviarPagamentoConfirmadoCloud(phone, {
      cliente: primeiroNome(name),
      homenageado: honoree,
      link: url,
      orderId,
      audio1: v1,
      audio2: v2,
    }, env);
    if (res.success) return res;
    return { success: false, error: `cloud_api: ${res.error}` };
  }

  return { success: false, error: 'Cloud API não configurada (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' };
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
