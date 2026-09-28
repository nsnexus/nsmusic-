import { getRequestContext } from '@cloudflare/next-on-pages';
import { formatToWhatsAppNumber } from './whatsappTemplates.js';

// WhatsApp Cloud API (API oficial da Meta) — usada só como RESERVA de envio.
//
// Escopo definido pelo dono do estúdio em 27/09/2026: ela existe para garantir as duas mensagens
// que não podem faltar — "sua música ficou pronta" e "pagamento confirmado". Não recebe mensagem,
// não atende cliente, não substitui a Evolution. É o paraquedas para quando o número da Evolution
// cair ou for suspenso (já aconteceu duas vezes).
//
// A DIFERENÇA QUE MANDA NO DESENHO: a Meta não deixa a empresa iniciar conversa com texto livre.
// Fora da janela de 24h desde a última mensagem do cliente, só passa TEMPLATE previamente aprovado
// por eles. E as nossas duas mensagens são sempre iniciadas por nós — a música fica pronta minutos
// depois do pedido, o pagamento cai quando cai. Por isso aqui só existe envio de template, com
// variáveis; texto livre é ignorado de propósito, para ninguém achar que funciona e descobrir na
// hora errada.
//
// Os templates precisam ser criados e aprovados no painel da Meta (WhatsApp Manager > Modelos de
// mensagem), em português do Brasil, categoria UTILITY. Ver docs/WHATSAPP_CLOUD_API.md.

const GRAPH_VERSION = 'v21.0';

export function getCloudApiConfig(env = {}) {
  let ctxEnv = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) ctxEnv = ctx.env;
  } catch (e) {}

  const ler = (nome) => String(env[nome] || ctxEnv[nome] || process.env[nome] || '').trim();

  const token = ler('WHATSAPP_ACCESS_TOKEN');
  const phoneNumberId = ler('WHATSAPP_PHONE_NUMBER_ID');

  return {
    token,
    phoneNumberId,
    // Nomes dos templates aprovados, configuráveis por variável para não exigir deploy quando um
    // template for recriado com outro nome (acontece: reprovação da Meta obriga a refazer).
    templateMusicaPronta: ler('WHATSAPP_TEMPLATE_MUSICA') || 'musica_pronta',
    templatePagamento: ler('WHATSAPP_TEMPLATE_PAGAMENTO') || 'pagamento_confirmado',
    enabled: Boolean(token && phoneNumberId),
  };
}

/**
 * Envia um template aprovado pela Meta.
 *
 * @param {string} phone telefone do cliente
 * @param {string} templateName nome exato do template aprovado
 * @param {string[]} variaveis valores das variáveis {{1}}, {{2}}... na ordem
 * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
 */
export async function sendCloudApiTemplate(phone, templateName, variaveis = [], env = {}) {
  const config = getCloudApiConfig(env);
  if (!config.enabled) {
    return { success: false, error: 'Cloud API não configurada (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' };
  }

  const numero = formatToWhatsAppNumber(phone);
  if (!numero) return { success: false, error: 'Telefone inválido.' };

  const corpo = {
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      ...(variaveis.length > 0
        ? {
          components: [{
            type: 'body',
            parameters: variaveis.map((v) => ({ type: 'text', text: String(v ?? '') })),
          }],
        }
        : {}),
    },
  };

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${config.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.messages?.length) {
      return { success: true, provider: 'cloud_api', phoneUsed: numero };
    }

    // A mensagem de erro da Meta é específica e vale no log: template não aprovado, número não
    // cadastrado e token expirado dão erros bem diferentes, e adivinhar qual foi custa horas.
    const motivo = data?.error?.message || `HTTP ${res.status}`;
    console.warn('[CloudAPI] Falha ao enviar template:', templateName, motivo);
    return { success: false, error: motivo };
  } catch (err) {
    console.warn('[CloudAPI] Erro de rede:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * "Sua música ficou pronta" — variáveis: nome do cliente, nome do homenageado, link da entrega.
 */
export async function enviarMusicaProntaCloud(phone, { cliente, homenageado, link }, env = {}) {
  const config = getCloudApiConfig(env);
  return sendCloudApiTemplate(phone, config.templateMusicaPronta, [cliente, homenageado, link], env);
}

/**
 * "Pagamento confirmado" — variáveis: nome do cliente, nome do homenageado, link da entrega.
 */
export async function enviarPagamentoConfirmadoCloud(phone, { cliente, homenageado, link }, env = {}) {
  const config = getCloudApiConfig(env);
  return sendCloudApiTemplate(phone, config.templatePagamento, [cliente, homenageado, link], env);
}
