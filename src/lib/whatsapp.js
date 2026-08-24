import { getRequestContext } from '@cloudflare/next-on-pages';
import { resolveDeliveryUrl, formatToWhatsAppNumber } from './whatsappTemplates';

export { resolveDeliveryUrl, formatToWhatsAppNumber };

const WAPI_BASE_URL = 'https://api.w-api.app/v1';
const DEFAULT_INSTANCE_ID = 'LITE-34O7BP-59EWJO';
const DEFAULT_TOKEN = 'xVm8wbENzXq1UAicisSshnAPGVQE6yedr';

export const getWApiConfig = (env = {}) => {
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  const instanceId = env.WAPI_INSTANCE_ID || ctxEnv.WAPI_INSTANCE_ID || process.env.WAPI_INSTANCE_ID || DEFAULT_INSTANCE_ID;
  const token = env.WAPI_TOKEN || ctxEnv.WAPI_TOKEN || process.env.WAPI_TOKEN || DEFAULT_TOKEN;

  return { instanceId, token, baseUrl: WAPI_BASE_URL };
};

/**
 * Envia uma mensagem de texto simples via W-API
 */
export const sendWApiTextMessage = async (phone, message, env = {}) => {
  const { instanceId, token, baseUrl } = getWApiConfig(env);
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }
  if (!instanceId || !token) {
    return { success: false, error: 'W-API não configurado.' };
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
  const url = deliveryUrl || 'https://nsmusic.nsnexus.com.br';

  const message = `🎵 *Olá, ${name}!*

A sua música personalizada para *${honoree}* já está pronta com 2 arranjos exclusivos no estúdio *NS Music*! 🎧

👉 *Ouça as prévias e baixe os arquivos em alta definição:*
${url}

Se precisar de qualquer suporte, basta responder a esta mensagem! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Envia mensagem de confirmação de pagamento aprovado.
 */
export const sendPaymentApprovedTemplate = async (phone, { customerName, honoreeName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const honoree = honoreeName || 'alguém especial';
  const url = deliveryUrl || 'https://nsmusic.nsnexus.com.br';

  const message = `🎉 *Pagamento Confirmado!*

Olá, ${name}! Os arquivos de áudio em MP3 HD da sua homenagem para *${honoree}* já estão 100% liberados para download!

👉 *Baixe suas músicas completas aqui:*
${url}

Muito obrigado por escolher o NS Music para eternizar esse momento! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Envia mensagem de recuperação de carrinho.
 */
export const sendRecoveryTemplate = async (phone, templateName, { customerName, deliveryUrl }, env = {}) => {
  const name = customerName || 'Cliente';
  const url = deliveryUrl || 'https://nsmusic.nsnexus.com.br';

  const is24h = templateName?.includes('24h');
  const discountText = is24h ? 'com *desconto especial por tempo limitado*' : 'aguardando por você';

  const message = `Oi, ${name}! Passando para avisar que a prévia da sua música personalizada ainda está ${discountText}! 🎶

Não perca essa homenagem emocionante:
👉 ${url}

Qualquer dúvida, estamos por aqui! 💜`;

  return await sendWApiTextMessage(phone, message, env);
};

/**
 * Envia texto livre
 */
export const sendFreeTextReply = async (phone, message, env = {}) => {
  return await sendWApiTextMessage(phone, message, env);
};
