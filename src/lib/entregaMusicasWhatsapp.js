// Entrega das músicas no WhatsApp oficial (Cloud API), pedido do dono do estúdio em 25/11/2026 para
// acabar com o "não consigo baixar".
//
// A Meta só deixa mandar áudio dentro da janela de 24 h aberta por uma mensagem do cliente. Por isso o
// aviso de pagamento aprovado (modelo `entrega_musicas_nsmusic`) leva o botão "Receber minhas músicas":
// o toque do cliente abre a janela e chega aqui como mensagem do tipo `button`, com o id do pedido no
// payload. Respondemos com as músicas em áudio e um botão para a página do pedido (vídeo, MP3).
//
// Regras: só pedido pago (conferido no banco agora); só para o telefone do próprio pedido (o payload
// viaja pelo cliente, então é uma alegação, não uma permissão); no máximo um envio a cada 10 min por
// pedido, reservado de forma atômica (toque duplo ou webhook repetido não duplica).

import { getSupabaseEdge } from './supabase-edge.js';
import { getOrder } from './supabaseDb.js';
import { faixasParaEntregar } from './suporteChat.js';
import { enviarMensagemCloud, enviarBotaoSuporteCloud, PREFIXO_RECEBER_MUSICAS } from './whatsappCloudApi.js';
import { resolverSiteUrl } from './siteUrl.js';

export const PREFIXO_RECEBER = PREFIXO_RECEBER_MUSICAS;
export const INTERVALO_REENVIO_MS = 10 * 60 * 1000;

export function payloadReceberMusicas(orderId) {
  return `${PREFIXO_RECEBER}${orderId}`;
}

/** id do pedido do payload do botão, ou '' quando não é o botão de receber músicas. */
export function pedidoDoPayload(payload) {
  const p = String(payload || '');
  if (!p.startsWith(PREFIXO_RECEBER)) return '';
  const id = p.slice(PREFIXO_RECEBER.length).trim();
  return /^[A-Za-z0-9_-]{10,64}$/.test(id) ? id : '';
}

// DDD + 8 últimos dígitos: o WhatsApp entrega números do Brasil às vezes sem o nono dígito.
function chaveTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  return d.length >= 10 ? `${d.slice(0, 2)}${d.slice(-8)}` : d;
}

export function mesmoTelefone(a, b) {
  const ka = chaveTelefone(a);
  return ka.length >= 10 && ka === chaveTelefone(b);
}

async function reservarEnvio(orderId, env) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return true;
  const chave = `entrega_wa_${orderId}`;
  const agora = new Date().toISOString();
  const valor = { at: agora };
  const novo = await supabase.from('config').insert({ chave, valor, updated_at: agora });
  if (!novo.error) return true;
  // Já existe: só vale de novo depois do intervalo (cliente que apagou a conversa e tocou outra vez).
  const limite = new Date(Date.now() - INTERVALO_REENVIO_MS).toISOString();
  const { data, error } = await supabase.from('config').eq('chave', chave).lt('updated_at', limite).update({ valor, updated_at: agora });
  if (error) {
    console.warn('[entregaWhatsapp] Falha ao reservar o envio:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Cliente tocou em "Receber minhas músicas". Nunca lança.
 * @returns {Promise<{enviado: boolean, motivo?: string, audios?: number}>}
 */
export async function entregarMusicasNoWhatsapp(telefone, orderId, env = {}, deps = {}) {
  const ler = deps.getOrder || getOrder;
  const faixasDe = deps.faixasParaEntregar || faixasParaEntregar;
  const enviar = deps.enviarMensagemCloud || enviarMensagemCloud;
  const botaoSuporte = deps.enviarBotaoSuporteCloud || enviarBotaoSuporteCloud;
  const reservar = deps.reservarEnvio || reservarEnvio;

  try {
    const pedido = orderId ? await ler(orderId, env) : null;
    if (!pedido) {
      await botaoSuporte(telefone, {}, env);
      return { enviado: false, motivo: 'pedido_nao_encontrado' };
    }
    if (!mesmoTelefone(telefone, pedido.customerPhone)) {
      await botaoSuporte(telefone, {}, env);
      return { enviado: false, motivo: 'telefone_diferente' };
    }

    const { liberado, faixas } = await faixasDe(pedido, env);
    if (!liberado || faixas.length === 0) {
      await botaoSuporte(telefone, { orderId: pedido.id }, env);
      return { enviado: false, motivo: liberado ? 'sem_musica' : 'nao_pago' };
    }

    if (!(await reservar(pedido.id, env))) return { enviado: false, motivo: 'ja_enviado' };

    const base = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL);
    const linkPedido = `${base}/entrega?orderId=${encodeURIComponent(pedido.id)}`;

    await enviar(telefone, {
      type: 'text',
      text: { body: `Aqui estão suas músicas${pedido.honoreeName ? ` para *${pedido.honoreeName}*` : ''}! 🎶\n\nToque no ▶️ para ouvir. Para guardar, segure o áudio e escolha *Salvar* ou *Compartilhar*, ou encaminhe para quem você quiser.` },
    }, env);

    let audios = 0;
    for (const f of faixas.slice(0, 4)) {
      const r = await enviar(telefone, { type: 'audio', audio: { link: `${base}${f.url}` } }, env);
      if (r.success) audios += 1;
    }

    await enviar(telefone, {
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: { text: 'Na página do seu pedido você faz o vídeo com as fotos e baixa os arquivos em MP3. Obrigado por escolher a NS Music! ❤️' },
        action: { name: 'cta_url', parameters: { display_text: 'Acessar meu pedido', url: linkPedido } },
      },
    }, env);

    return { enviado: audios > 0, audios, ...(audios === 0 ? { motivo: 'falha_no_envio' } : {}) };
  } catch (err) {
    console.warn('[entregaWhatsapp] Erro ao entregar as músicas:', err?.message);
    return { enviado: false, motivo: 'erro' };
  }
}
