import { getRequestContext } from '@cloudflare/next-on-pages';
import { resolveDeliveryUrl, formatToWhatsAppNumber } from './whatsappTemplates';

// Templates de mensagem (ver M-19 no AUDIT_REPORT.md) vivem em src/lib/whatsappTemplates.js — um
// arquivo sem dependência de @cloudflare/next-on-pages, para poder ser importado também por
// componentes client-side sem levar código Edge-only pro bundle do browser.
//
// IMPORTANTE: import explícito acima (não só `export ... from`) — `export {x} from 'y'` reexporta
// mas NÃO cria uma referência local utilizável neste arquivo (semântica de ES Modules). Uma versão
// anterior só tinha o `export ... from`, e o uso de formatToWhatsAppNumber() dentro de
// sendTemplateMessage (mais abaixo) virava undefined no bundle da Cloudflare — TypeError não
// capturado pelo try/catch interno (a chamada é antes do loop protegido), subindo até o catch
// genérico de src/lib/db.js:updateTaskResult sem nenhum log específico. É a causa provável de
// nenhuma notificação de WhatsApp ter saído desde a mudança (14/08/2026).
export { resolveDeliveryUrl, formatToWhatsAppNumber };

/**
 * Módulo de Integração com a API Oficial da Meta (WhatsApp Business Platform / Cloud API).
 *
 * Migrado depois de sucessivos bloqueios de conta na W-API (provedor não oficial, removido do
 * projeto). Único envio automático que resta é a mensagem de "música pronta". Diferente da W-API,
 * aqui só dá pra mandar texto livre dentro de uma janela de 24h depois do cliente escrever pra
 * gente — mensagem iniciada pela empresa (é o nosso caso) precisa de um Template pré-aprovado pela
 * Meta. Por isso não existe um "sendWhatsAppMessage" genérico aqui: a mensagem tem sua própria
 * função com as variáveis do Template já aprovado.
 */
const WHATSAPP_GRAPH_BASE_URL = 'https://graph.facebook.com/v21.0';

export const getWhatsAppCloudConfig = (env = {}) => {
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID || ctxEnv.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  const accessToken = env.WHATSAPP_ACCESS_TOKEN || ctxEnv.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || '';

  if (!phoneNumberId || !accessToken) {
    console.error('[WhatsApp Cloud API] ❌ WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN não configurados nas variáveis de ambiente!');
  }

  return { phoneNumberId, accessToken, baseUrl: WHATSAPP_GRAPH_BASE_URL };
};

/**
 * {{4}} (em ambos os Templates abaixo) é o link wa.me de suporte — a restrição da Meta contra link
 * do WhatsApp é só pra BOTÃO ("Visitar site"), não pro corpo do texto; como texto livre, o link
 * fica clicável normalmente. Fica fora do texto aprovado pela Meta de propósito: trocar o número
 * aqui não exige reenviar o Template pra revisão (mesmo número usado em criar/page.jsx).
 */
const SUPPORT_WHATSAPP_URL = 'https://wa.me/5594991064043';

// Cabeçalho de imagem — precisa ser a MESMA imagem enviada como amostra na aprovação de cada
// Template na Meta (a amostra do cadastro só serve pra revisão, não é reaproveitada no envio).
// URL fixa de produção (a Meta busca essa imagem a partir dos servidores dela, então precisa ser
// sempre pública — nunca localhost/preview) em vez de reenviada a cada chamada (media ID expira).
const HEADER_IMAGE_URL = 'https://nsmusic.nsnexus.com.br/whatsapp-musica-pronta-header.jpeg';

// Base fixa dos botões "Versão 1"/"Versão 2" do Template de pagamento aprovado — a Meta exige que
// o domínio de um botão de URL dinâmica seja fixo (definido na aprovação do Template); só o sufixo
// (a URL real do áudio, urlencoded) varia por pedido. Reaproveita o proxy de áudio já existente
// (src/app/api/audio/proxy/route.js) em vez de linkar direto pro CDN da Suno/Kie.ai, cujo domínio
// muda e não pode ser fixado num botão.
const AUDIO_PROXY_BASE_URL = 'https://nsmusic.nsnexus.com.br/api/audio/proxy?url=';

// Envia um Template de cabeçalho-imagem + 4 variáveis de texto (nome, homenageado, link, suporte),
// com até 2 botões de URL dinâmica opcionais (audioUrls) — estrutura compartilhada por todas as
// mensagens automáticas do NS Music via Cloud API.
const sendTemplateMessage = async (phone, templateName, { customerName, honoreeName, deliveryUrl, audioUrls }, env = {}) => {
  const { phoneNumberId, accessToken, baseUrl } = getWhatsAppCloudConfig(env);
  const formattedNumber = formatToWhatsAppNumber(phone);

  if (!formattedNumber) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'Configuração ausente: WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN não definidos.' };
  }

  const numbersToSend = [formattedNumber];
  // Para celular brasileiro com 13 dígitos, tenta também a variante de 12 dígitos sem o 9º dígito
  // inicial — números cadastrados no WhatsApp de formas diferentes.
  if (formattedNumber.startsWith('55') && formattedNumber.length === 13 && formattedNumber[4] === '9') {
    const withoutNine = `${formattedNumber.substring(0, 4)}${formattedNumber.substring(5)}`;
    numbersToSend.push(withoutNine);
  }

  const buttonComponents = (audioUrls || [])
    .filter(Boolean)
    .slice(0, 2)
    .map((url, index) => ({
      type: 'button',
      sub_type: 'url',
      index: String(index),
      // Só o sufixo depois de AUDIO_PROXY_BASE_URL — a Meta concatena com a URL base aprovada.
      parameters: [{ type: 'text', text: encodeURIComponent(url) }],
    }));

  const payloadFor = (num) => ({
    messaging_product: 'whatsapp',
    to: num,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: HEADER_IMAGE_URL } }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: customerName || 'Cliente' },
            { type: 'text', text: honoreeName || 'alguém especial' },
            { type: 'text', text: deliveryUrl || '' },
            { type: 'text', text: SUPPORT_WHATSAPP_URL },
          ],
        },
        ...buttonComponents,
      ],
    },
  });

  let lastError = '';
  for (let i = 0; i < numbersToSend.length; i++) {
    const num = numbersToSend[i];
    try {
      // Nunca logar o telefone do cliente (ver M-25 no AUDIT_REPORT.md) — o índice da variante já
      // basta para depurar.
      console.log(`[WhatsApp Cloud API] Enviando template ${templateName} (variante ${i + 1}/${numbersToSend.length})...`);

      const res = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadFor(num)),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        console.log('[WhatsApp Cloud API] ✅ Template enviado com sucesso.');
        return { success: true, phoneUsed: num };
      }

      const errData = await res.json().catch(() => ({}));
      // Mensagem de erro da Meta fica só no log do servidor, nunca repassada ao cliente (ver
      // .claude/rules/security.md — nunca ecoar error.message de serviço externo).
      lastError = errData?.error?.message || `HTTP ${res.status}`;
      console.error(`[WhatsApp Cloud API] Erro ao enviar (variante ${i + 1}):`, res.status, errData?.error?.code);
    } catch (error) {
      lastError = error.message;
      console.error(`[WhatsApp Cloud API] Erro de rede ao enviar (variante ${i + 1}):`, error.message);
    }
  }

  return { success: false, error: lastError };
};

/**
 * Envia o Template aprovado "nsmusic_musica_pronta" (categoria Utility) — avisa que a prévia ficou
 * pronta e o pedido ainda não foi pago.
 */
export const sendMusicReadyTemplate = (phone, params, env = {}) =>
  sendTemplateMessage(phone, 'nsmusic_musica_pronta', params, env);

/**
 * Envia um Template de recuperação de carrinho (ex: nsmusic_recovery_4h, nsmusic_recovery_24h).
 */
export const sendRecoveryTemplate = (phone, templateName, params, env = {}) =>
  sendTemplateMessage(phone, templateName, params, env);

/**
 * Envia o Template aprovado "nsmusic_pagamento_aprovado" (categoria Utility) — avisa que o
 * pagamento caiu e os áudios em MP3 HD já estão liberados pra download.
 */
export const sendPaymentApprovedTemplate = (phone, params, env = {}) =>
  sendTemplateMessage(phone, 'nsmusic_pagamento_aprovado', params, env);

/**
 * Envia texto livre (sem Template) via WhatsApp Cloud API — só é permitido dentro da janela de 24h
 * depois que o cliente escreveu primeiro (resposta automática do webhook). Fora dessa janela a Meta
 * recusa mensagem de texto livre; use sempre um Template pra mensagem iniciada pela empresa.
 */
export const sendFreeTextReply = async (phone, message, env = {}) => {
  const { phoneNumberId, accessToken, baseUrl } = getWhatsAppCloudConfig(env);

  if (!phone) {
    return { success: false, error: 'Telefone inválido ou não informado.' };
  }
  if (!phoneNumberId || !accessToken) {
    return { success: false, error: 'Configuração ausente: WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_ACCESS_TOKEN não definidos.' };
  }

  try {
    const res = await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) return { success: true };

    const errData = await res.json().catch(() => ({}));
    return { success: false, error: errData?.error?.message || `HTTP ${res.status}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};
