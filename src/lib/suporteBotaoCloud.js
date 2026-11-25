// Número oficial (Cloud API): quem escreve recebe o botão "Continuar conversa" para o chat de
// suporte do site (/suporte), já no pedido mais recente do telefone. Pedido do dono do estúdio em
// 25/11/2026, no lugar do silêncio de quando o robô está desligado.
//
// No máximo uma vez a cada 6 h por número: cliente que manda várias mensagens seguidas não recebe o
// mesmo botão várias vezes.

import { getSupabaseEdge } from './supabase-edge.js';
import { findRecentOrderByPhone } from './orderLookup.js';
import { enviarBotaoSuporteCloud } from './whatsappCloudApi.js';

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
