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
 * @param {{ buttonParam?: string }} opcoes opções extras como parâmetro de botão dinâmico
 * @returns {Promise<{success: boolean, provider?: string, error?: string}>}
 */
export async function sendCloudApiTemplate(phone, templateName, variaveis = [], { buttonParam } = {}, env = {}) {
  const config = getCloudApiConfig(env);
  if (!config.enabled) {
    return { success: false, error: 'Cloud API não configurada (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' };
  }

  const numero = formatToWhatsAppNumber(phone);
  if (!numero) return { success: false, error: 'Telefone inválido.' };

  const components = [];
  if (variaveis.length > 0) {
    components.push({
      type: 'body',
      parameters: variaveis.map((v) => ({ type: 'text', text: String(v ?? '') })),
    });
  }

  if (buttonParam) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: String(buttonParam) }],
    });
  }

  const corpo = {
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'pt_BR' },
      ...(components.length > 0 ? { components } : {}),
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

    // Se falhou por causa do botão dinâmico (ex: template cadastrado sem botão dinâmico na Meta),
    // tenta reenviar apenas com o body:
    if (!res.ok && buttonParam) {
      console.warn('[CloudAPI] Falha com componente de botão, tentando envio direto só com body...', data?.error?.message);
      return sendCloudApiTemplate(phone, templateName, variaveis, {}, env);
    }

    // Se falhou com 4 variáveis e o template na Meta tiver 3:
    if (!res.ok && variaveis.length > 3 && data?.error?.message?.includes('parameters')) {
      console.warn('[CloudAPI] Falha de contagem de parâmetros, tentando com 3 variáveis...', data?.error?.message);
      return sendCloudApiTemplate(phone, templateName, [variaveis[0], variaveis[1], variaveis[2]], {}, env);
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
  const idDoPedido = (link ? String(link).match(/orderId=([^&]+)/)?.[1] : '') || '';
  return sendCloudApiTemplate(phone, config.templateMusicaPronta, [cliente, homenageado, link], { buttonParam: idDoPedido }, env);
}

/**
 * "Pagamento confirmado" — variáveis: nome do cliente, nome do homenageado, link versão 1, link versão 2.
 * Botão dinâmico opcional com o orderId.
 */
export async function enviarPagamentoConfirmadoCloud(phone, { cliente, homenageado, link, orderId, audio1, audio2 }, env = {}) {
  const config = getCloudApiConfig(env);
  const safeV1 = audio1 || link;
  const safeV2 = audio2 || audio1 || link;
  const idDoPedido = orderId || (link ? String(link).match(/orderId=([^&]+)/)?.[1] : '') || '';

  return sendCloudApiTemplate(
    phone,
    config.templatePagamento,
    [cliente, homenageado, safeV1, safeV2],
    { buttonParam: idDoPedido },
    env,
  );
}
