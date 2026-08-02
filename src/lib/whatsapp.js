import { getRequestContext } from '@cloudflare/next-on-pages';

/**
 * Módulo de Integração com a W-API (https://w-api.app)
 *
 * Credenciais devem estar configuradas via variáveis de ambiente
 * no Cloudflare Pages (WAPI_INSTANCE_ID e WAPI_TOKEN).
 */

// Templates de mensagem (ver M-19 no AUDIT_REPORT.md) vivem em src/lib/whatsappTemplates.js — um
// arquivo sem dependência de @cloudflare/next-on-pages, para poder ser importado também por
// componentes client-side (ex: admin/pedidos/[id]/page.jsx) sem levar código Edge-only pro bundle
// do browser. Re-exportados aqui só para quem já importa @/lib/whatsapp por convenção.
export { resolveDeliveryUrl, buildMusicReadyMessage, buildPaymentApprovedMessage, buildVideoApprovedMessage, buildApprovalMessage, buildAdminSaleNotification } from './whatsappTemplates';

const WAPI_BASE_URL = 'https://api.w-api.app/v1';

export const getWApiConfig = (env = {}) => {
  // Tenta pegar variáveis do Cloudflare Runtime
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  // Prioridade: env passado > Cloudflare > process.env
  const instanceId = env.WAPI_INSTANCE_ID || ctxEnv.WAPI_INSTANCE_ID || process.env.WAPI_INSTANCE_ID || '';
  const token = env.WAPI_TOKEN || ctxEnv.WAPI_TOKEN || process.env.WAPI_TOKEN || '';

  if (!instanceId || !token) {
    console.error('[W-API Config] ❌ WAPI_INSTANCE_ID ou WAPI_TOKEN não configurados nas variáveis de ambiente!');
  }

  const source = env.WAPI_TOKEN ? 'env-param' : ctxEnv.WAPI_TOKEN ? 'cloudflare-ctx' : process.env.WAPI_TOKEN ? 'process.env' : 'MISSING';
  console.log(`[W-API Config] instanceId=${instanceId || 'VAZIO'}, tokenLength=${token?.length || 0}, source=${source}`);

  return { instanceId, token, baseUrl: WAPI_BASE_URL };
};

/**
 * Formata um telefone brasileiro para o formato internacional 55+DDD+Número
 */
export const formatToWhatsAppNumber = (phone) => {
  if (!phone) return '';
  let clean = phone.replace(/\D/g, '');
  if (!clean) return '';

  // Se já começar com 55 e tiver 12 ou 13 dígitos
  if (clean.startsWith('55') && (clean.length === 12 || clean.length === 13)) {
    return clean;
  }

  // Se for DDD + 8 ou 9 dígitos (ex: 94991064040 ou 9491064040)
  if (clean.length === 10 || clean.length === 11) {
    return `55${clean}`;
  }

  return clean;
};

/**
 * Verifica em tempo real se um número possui conta ativa no WhatsApp via W-API
 */
export const verifyWhatsAppNumber = async (phone, env = {}) => {
  const { instanceId, token, baseUrl } = getWApiConfig(env);
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber || formattedNumber.length < 12) {
    return { exists: false, reason: 'Número incompleto' };
  }

  try {
    const res = await fetch(`${baseUrl}/contacts/phone-exists?instanceId=${instanceId}&phoneNumber=${formattedNumber}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      console.warn("Aviso ao consultar W-API:", res.status);
      return { exists: false, fallback: true };
    }

    const data = await res.json();
    const exists = data?.exists === true;

    return {
      exists,
      lid: data?.lid || null,
      number: formattedNumber
    };
  } catch (error) {
    console.error("Erro na verificação de WhatsApp:", error);
    return { exists: false, fallback: true, error: error.message };
  }
};

/**
 * Envia uma mensagem com detalhes de diagnóstico estendidos.
 * Tenta enviar com e sem o dígito 9 para celulares brasileiros.
 */
export const sendWhatsAppMessageDetailed = async (phone, message, env = {}) => {
  const { instanceId, token, baseUrl } = getWApiConfig(env);
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }

  const numbersToSend = [formattedNumber];

  // Para celular brasileiro com 13 dígitos (55 + DDD + 9 + 8 dígitos), tenta também a versão de 12 dígitos sem o 9 inicial
  if (formattedNumber.startsWith('55') && formattedNumber.length === 13 && formattedNumber[4] === '9') {
    const withoutNine = `${formattedNumber.substring(0, 4)}${formattedNumber.substring(5)}`;
    numbersToSend.push(withoutNine);
  }

  // Usa o token resolvido das variáveis de ambiente
  const tokensToTry = [token].filter(Boolean);

  let lastError = '';

  for (const currentToken of tokensToTry) {
    for (const num of numbersToSend) {
      try {
        console.log(`[W-API Send] Tentando enviar para ${num} com token (${currentToken.substring(0, 6)}...) via instanceId=${instanceId}`);

        const res = await fetch(`${baseUrl}/message/send-text?instanceId=${instanceId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phone: num,
            message: message
          }),
          signal: AbortSignal.timeout(10000)
        });

        if (res.ok) {
          console.log(`[W-API Send] ✅ Mensagem enviada com sucesso para ${num}`);
          return { success: true, phoneUsed: num };
        } else {
          const errText = await res.text().catch(() => '');
          lastError = `W-API HTTP ${res.status}: ${errText || res.statusText}`;
          console.error(`[W-API Send] Erro ao enviar para ${num}:`, lastError);

          // Se for 403 (token inválido), pula direto para o próximo token
          if (res.status === 403) {
            console.warn(`[W-API Send] Token inválido, tentando próximo token...`);
            break;
          }
        }
      } catch (error) {
        lastError = error.message;
        console.error(`[W-API Send] Erro de rede ao disparar para ${num}:`, error);
      }
    }
  }

  return { success: false, error: lastError };
};

/**
 * Envia uma mensagem de texto simples via WhatsApp
 */
export const sendWhatsAppMessage = async (phone, message, env = {}) => {
  const result = await sendWhatsAppMessageDetailed(phone, message, env);
  return result.success;
};
