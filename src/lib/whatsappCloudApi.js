import { getRequestContext } from '@cloudflare/next-on-pages';
import { formatToWhatsAppNumber } from './whatsappTemplates.js';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from './configSite.js';

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
    templateMusicaPronta: ler('WHATSAPP_TEMPLATE_MUSICA') || 'aviso_musica_pronta',
    templateMusicaProntaVideo: ler('WHATSAPP_TEMPLATE_MUSICA_VIDEO') || 'entrega_pedido_musica_video',
    templatePagamento: ler('WHATSAPP_TEMPLATE_PAGAMENTO') || 'confirmacao_pagamento_v2',
    templatePagamentoDownloads: ler('WHATSAPP_TEMPLATE_PAGAMENTO_DOWNLOADS') || 'confirmacao_pagamento_downloads',
    templatePagamentoV2: ler('WHATSAPP_TEMPLATE_PAGAMENTO_V2') || 'confirmacao_pagamento_v2',
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
export async function sendCloudApiTemplate(phone, templateName, variaveis = [], { buttonParam, buttonParams, headerVideoUrl, headerImageUrl } = {}, env = {}) {
  const config = getCloudApiConfig(env);
  if (!config.enabled) {
    return { success: false, error: 'Cloud API não configurada (WHATSAPP_ACCESS_TOKEN/WHATSAPP_PHONE_NUMBER_ID).' };
  }

  const numero = formatToWhatsAppNumber(phone);
  if (!numero) return { success: false, error: 'Telefone inválido.' };

  const components = [];

  if (headerImageUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'image', image: { link: String(headerImageUrl) } }],
    });
  } else if (headerVideoUrl) {
    components.push({
      type: 'header',
      parameters: [{ type: 'video', video: { link: String(headerVideoUrl) } }],
    });
  }

  if (variaveis.length > 0) {
    components.push({
      type: 'body',
      parameters: variaveis.map((v) => ({ type: 'text', text: String(v ?? '') })),
    });
  }

  if (Array.isArray(buttonParams) && buttonParams.length > 0) {
    buttonParams.forEach((param, idx) => {
      components.push({
        type: 'button',
        sub_type: 'url',
        index: String(idx),
        parameters: [{ type: 'text', text: String(param) }],
      });
    });
  } else if (buttonParam) {
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

    // Se falhou por causa do componente de botão, tenta reenviar mantendo o header (se houver) e apenas com body:
    if (!res.ok && (buttonParam || (Array.isArray(buttonParams) && buttonParams.length > 0))) {
      console.warn('[CloudAPI] Falha com componente de botão, tentando envio sem botões...', data?.error?.message);
      return sendCloudApiTemplate(phone, templateName, variaveis, { headerImageUrl, headerVideoUrl }, env);
    }

    // Fallback bidirecional de parâmetros para compatibilidade com o template na Meta:
    // Se enviamos 4 variáveis e o template espera 3 (ou não aceita parâmetros no final):
    if (!res.ok && variaveis.length > 3 && (data?.error?.message?.includes('parameters') || data?.error?.message?.includes('localizable_params'))) {
      console.warn('[CloudAPI] Template espera 3 variáveis (sem parâmetro extra no final). Tentando com 3 variáveis...', data?.error?.message);
      return sendCloudApiTemplate(phone, templateName, [variaveis[0], variaveis[1], variaveis[2]], {}, env);
    }
    // Se enviamos 3 variáveis e o template exige 4 (incluindo link dinâmico de suporte):
    if (!res.ok && variaveis.length === 3 && (data?.error?.message?.includes('parameters') || data?.error?.message?.includes('localizable_params'))) {
      const cfgSite = await lerConfigSite(env).catch(() => ({}));
      const numSuporte = normalizarNumeroWhatsapp(cfgSite?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;
      const linkSuporte = `https://wa.me/${numSuporte}`;
      console.warn('[CloudAPI] Template exige 4 variáveis. Tentando com link dinâmico de suporte...', data?.error?.message);
      return sendCloudApiTemplate(phone, templateName, [...variaveis, linkSuporte], {}, env);
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
 * "Sua música ficou pronta" — com suporte a vídeo oficial no header e botão de liberar música.
 */
export async function enviarMusicaProntaCloud(phone, { cliente, homenageado, link }, env = {}) {
  const config = getCloudApiConfig(env);
  const cfgSite = await lerConfigSite(env);
  const numSuporte = normalizarNumeroWhatsapp(cfgSite?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;
  const linkSuporte = `https://wa.me/${numSuporte}`;

  return sendCloudApiTemplate(
    phone,
    config.templateMusicaPronta,
    [cliente, homenageado, link, linkSuporte],
    {},
    env
  );
}

/**
 * "Pagamento confirmado" — com suporte a banner oficial no header e botões de download direto.
 */
export async function enviarPagamentoConfirmadoCloud(phone, { cliente, homenageado, link, orderId, audio1, audio2 }, env = {}) {
  const config = getCloudApiConfig(env);
  const cfgSite = await lerConfigSite(env);
  const numSuporte = normalizarNumeroWhatsapp(cfgSite?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;
  const linkSuporte = `https://wa.me/${numSuporte}`;

  const resolvedOrderId = orderId || (link ? link.match(/orderId=([^&]+)/)?.[1] : '') || '';
  const nomeCliente = cliente || 'Cliente';
  const nomeHomenageado = homenageado || 'alguém especial';
  const resolvedLink = link || (resolvedOrderId ? `https://nsmusic.nsnexus.com.br/entrega?orderId=${resolvedOrderId}` : 'https://nsmusic.nsnexus.com.br');

  // 1. Modelo oficial confirmacao_pagamento_v2 (Banner oficial no header + botões de download direto)
  if (resolvedOrderId) {
    const bannerUrl = 'https://nsmusic.nsnexus.com.br/banner-whatsapp.jpg';
    const resV2 = await sendCloudApiTemplate(
      phone,
      config.templatePagamentoV2,
      [nomeCliente, nomeHomenageado, resolvedLink],
      {
        headerImageUrl: bannerUrl,
        buttonParams: [resolvedOrderId, resolvedOrderId],
      },
      env
    );
    if (resV2.success) return resV2;
    console.warn('[CloudAPI] Template confirmacao_pagamento_v2 falhou, tentando template legado...', resV2.error);
  }

  // 2. Se os links de download direto estiverem disponíveis, tenta o template legado com downloads no texto
  if (audio1 && audio2) {
    const resDownloads = await sendCloudApiTemplate(
      phone,
      config.templatePagamentoDownloads,
      [nomeCliente, nomeHomenageado, audio1, audio2, resolvedLink, linkSuporte],
      {},
      env
    );
    if (resDownloads.success) return resDownloads;
    console.warn('[CloudAPI] Falha no template com downloads no texto, tentando template padrão...', resDownloads.error);
  }

  // 3. Fallback para o template padrão aprovado
  return sendCloudApiTemplate(
    phone,
    config.templatePagamento,
    [nomeCliente, nomeHomenageado, resolvedLink, linkSuporte],
    {},
    env
  );
}
