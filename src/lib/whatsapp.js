import { getRequestContext } from '@cloudflare/next-on-pages';

// Templates de mensagem (ver M-19 no AUDIT_REPORT.md) vivem em src/lib/whatsappTemplates.js — um
// arquivo sem dependência de @cloudflare/next-on-pages, para poder ser importado também por
// componentes client-side sem levar código Edge-only pro bundle do browser. Re-exportado aqui só
// para quem já importa @/lib/whatsapp por convenção.
export { resolveDeliveryUrl } from './whatsappTemplates';

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
 * Envia o Template aprovado "nsmusic_musica_pronta" (categoria Utility) via WhatsApp Cloud API.
 * Corpo do Template: "Olá, {{1}}! 🎵 Sua música personalizada para *{{2}}* ficou pronta com sucesso
 * no estúdio NSMusic! Foram produzidas 2 versões completas em alta qualidade. Ouça e baixe em: {{3}}
 * 🎶\n\nDúvidas ou precisa de ajuda? Fale com a gente: {{4}}."
 *
 * {{4}} é o link wa.me de suporte — a restrição da Meta contra link do WhatsApp é só pra BOTÃO
 * ("Visitar site"), não pro corpo do texto; como texto livre, o link fica clicável normalmente.
 * Fica fora do texto aprovado pela Meta de propósito: trocar o número aqui não exige reenviar o
 * Template pra revisão (mesmo número usado em criar/page.jsx).
 */
const SUPPORT_WHATSAPP_URL = 'https://wa.me/5594991064043';

// Cabeçalho de imagem do Template — precisa ser a MESMA imagem enviada como amostra na aprovação
// do Template na Meta (a amostra do cadastro só serve pra revisão, não é reaproveitada no envio).
// URL fixa de produção (a Meta busca essa imagem a partir dos servidores dela, então precisa ser
// sempre pública — nunca localhost/preview) em vez de reenviada a cada chamada (media ID expira).
const MUSIC_READY_HEADER_IMAGE_URL = 'https://nsmusic.nsnexus.com.br/whatsapp-musica-pronta-header.jpeg';

export const sendMusicReadyTemplate = async (phone, { customerName, honoreeName, deliveryUrl }, env = {}) => {
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

  const payloadFor = (num) => ({
    messaging_product: 'whatsapp',
    to: num,
    type: 'template',
    template: {
      name: 'nsmusic_musica_pronta',
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: MUSIC_READY_HEADER_IMAGE_URL } }],
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
      ],
    },
  });

  let lastError = '';
  for (let i = 0; i < numbersToSend.length; i++) {
    const num = numbersToSend[i];
    try {
      // Nunca logar o telefone do cliente (ver M-25 no AUDIT_REPORT.md) — o índice da variante já
      // basta para depurar.
      console.log(`[WhatsApp Cloud API] Enviando template música pronta (variante ${i + 1}/${numbersToSend.length})...`);

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
