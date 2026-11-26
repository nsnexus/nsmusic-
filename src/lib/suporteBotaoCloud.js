// Número oficial (Cloud API): quem escreve recebe o botão "Continuar conversa" para o chat de
// suporte do site (/suporte), já no pedido mais recente do telefone. Pedido do dono do estúdio em
// 25/11/2026, no lugar do silêncio de quando o robô está desligado.
//
// No máximo uma vez a cada 6 h por número: cliente que manda várias mensagens seguidas não recebe o
// mesmo botão várias vezes.

import { getSupabaseEdge } from './supabase-edge.js';
import { findRecentOrderByPhone } from './orderLookup.js';
import { enviarBotaoSuporteCloud } from './whatsappCloudApi.js';
import { pedidoDoPayload, entregarMusicasNoWhatsapp } from './entregaMusicasWhatsapp.js';

export const INTERVALO_BOTAO_MS = 6 * 60 * 60 * 1000;

async function jaEnviadoRecentemente(supabase, chave) {
  try {
    const { data } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
    const em = data?.valor?.at ? Date.parse(data.valor.at) : NaN;
    return !Number.isNaN(em) && Date.now() - em < INTERVALO_BOTAO_MS;
  } catch (err) {
    console.warn('[suporteBotaoCloud] Falha ao ler o último envio:', err?.message);
    return false;
  }
}

/** Nunca lança. @returns {Promise<{enviado: boolean, motivo?: string}>} */
export async function enviarBotaoSuporteParaCliente(phone, env = {}, deps = {}) {
  const digitos = String(phone || '').replace(/\D/g, '');
  if (digitos.length < 10) return { enviado: false, motivo: 'sem_telefone' };

  const supabase = (deps.getSupabaseEdge || getSupabaseEdge)(env);
  const chave = `suporte_botao_${digitos}`;
  if (supabase && await jaEnviadoRecentemente(supabase, chave)) return { enviado: false, motivo: 'botao_ja_enviado' };

  const pedido = await (deps.findRecentOrderByPhone || findRecentOrderByPhone)(digitos, env).catch(() => null);
  const r = await (deps.enviarBotaoSuporteCloud || enviarBotaoSuporteCloud)(digitos, { orderId: pedido?.id || '' }, env);
  if (!r.success) return { enviado: false, motivo: 'falha_no_envio' };

  if (supabase) {
    const { error } = await supabase.from('config').upsert({ chave, valor: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
    if (error) console.warn('[suporteBotaoCloud] Falha ao registrar o envio:', error.message);
  }
  return { enviado: true };
}

/**
 * Toques em "Receber minhas músicas" (resposta rápida do modelo de entrega) no webhook da Meta:
 * [{ de, orderId }]. O payload vem do modelo que nós enviamos, com o id do pedido.
 */
export function pedidosDeEntrega(body, phoneNumberId) {
  if (!phoneNumberId || body?.object !== 'whatsapp_business_account') return [];
  const lista = [];
  for (const entry of body.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (String(value?.metadata?.phone_number_id || '') !== String(phoneNumberId)) continue;
      for (const m of value?.messages || []) {
        const de = String(m?.from || '').replace(/\D/g, '');
        const orderId = pedidoDoPayload(m?.button?.payload || m?.interactive?.button_reply?.id);
        if (de && orderId && !lista.some((x) => x.de === de && x.orderId === orderId)) lista.push({ de, orderId });
      }
    }
  }
  return lista;
}

/** Remetentes das mensagens de clientes ao NÚMERO OFICIAL (o de disparo), num webhook da Meta. */
export function remetentesDoNumeroOficial(body, phoneNumberId) {
  if (!phoneNumberId || body?.object !== 'whatsapp_business_account') return [];
  const lista = [];
  for (const entry of body.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value;
      if (String(value?.metadata?.phone_number_id || '') !== String(phoneNumberId)) continue;
      for (const m of value?.messages || []) {
        const de = String(m?.from || '').replace(/\D/g, '');
        if (de && !lista.includes(de)) lista.push(de);
      }
    }
  }
  return lista;
}

/**
 * Webhook da Meta para o número oficial. Devolve null quando o corpo não é desse número (quem
 * chama segue o fluxo dele). Status de entrega/leitura não têm `messages` e não geram envio.
 *
 * Antes, as mensagens que chegavam ao número oficial caíam no fluxo da Evolution, que não lê o
 * formato da Meta, e morriam em silêncio (achado 25/11/2026).
 */
export async function processarWebhookNumeroOficial(corpoBruto, assinatura, env = {}, waitUntil = null) {
  const { getCloudApiConfig } = await import('./whatsappCloudApi.js');
  const config = getCloudApiConfig(env);
  if (!config.enabled) return null;

  let body;
  try { body = JSON.parse(corpoBruto); } catch (e) { return null; }
  if (body?.object !== 'whatsapp_business_account') return null;
  const ehDoOficial = (body.entry || []).some((e) => (e?.changes || []).some((c) => String(c?.value?.metadata?.phone_number_id || '') === String(config.phoneNumberId)));
  if (!ehDoOficial) return null;

  const segredo = String((env && env.WHATSAPP_APP_SECRET) || process.env.WHATSAPP_APP_SECRET || '').trim();
  if (segredo) {
    const { assinaturaValida } = await import('./whatsappAdmCloud.js');
    if (!(await assinaturaValida(corpoBruto, assinatura, segredo))) return { status: 401, json: { error: 'Assinatura inválida.' } };
  }

  const entregas = pedidosDeEntrega(body, config.phoneNumberId);
  const remetentes = remetentesDoNumeroOficial(body, config.phoneNumberId).filter((tel) => !entregas.some((e) => e.de === tel));
  if (remetentes.length === 0 && entregas.length === 0) return { status: 200, json: { ok: true, ignored: 'sem_mensagem' } };

  const trabalho = Promise.all([
    ...entregas.map((e) => entregarMusicasNoWhatsapp(e.de, e.orderId, env)),
    ...remetentes.map((tel) => enviarBotaoSuporteParaCliente(tel, env)),
  ])
    .catch((err) => console.warn('[suporteBotaoCloud] Erro ao responder o número oficial:', err?.message));
  if (waitUntil) waitUntil(trabalho);
  else await trabalho;
  return { status: 200, json: { ok: true, action: entregas.length ? 'entrega_musicas' : 'botao_suporte' } };
}
