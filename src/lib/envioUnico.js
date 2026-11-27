// Reserva de envio único (WhatsApp de "música pronta" e "pagamento aprovado").
//
// Webhook e polling chegam juntos; a trava antiga era ler-e-depois-gravar e deixava os dois
// passarem (medido em teste em 27/11/2026, quando os avisos voltaram a sair na hora). Aqui quem
// reserva é o INSERT na tabela `config` (chave é única): só um dos dois consegue. Se o envio falhar,
// `liberarEnvioUnico` apaga a reserva para o cron de avisosAtrasados tentar de novo.
import { getSupabaseEdge } from './supabase-edge.js';

// Reserva que ficou presa (envio caiu no meio, sem liberar) vale de novo depois disso.
const RESERVA_PRESA_MS = 10 * 60 * 1000;

/** @returns {Promise<boolean>} true se ESTA chamada pode enviar. */
export async function reservarEnvioUnico(chave, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return true; // sem banco (dev/testes): fica só com as travas do pedido
  const agora = new Date().toISOString();
  try {
    const novo = await supabase.from('config').insert({ chave, valor: { status: 'enviando', at: agora }, updated_at: agora });
    if (!novo.error) return true;
    const limite = new Date(Date.now() - RESERVA_PRESA_MS).toISOString();
    const { data, error } = await supabase.from('config')
      .eq('chave', chave)
      .eq('valor->>status', 'enviando')
      .lt('updated_at', limite)
      .update({ valor: { status: 'enviando', at: agora }, updated_at: agora });
    if (error) return false;
    return Array.isArray(data) && data.length > 0;
  } catch (err) {
    console.warn('[envioUnico] Falha ao reservar o envio:', err?.message);
    return false;
  }
}

export async function confirmarEnvioUnico(chave, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return;
  const agora = new Date().toISOString();
  try {
    await supabase.from('config').eq('chave', chave).update({ valor: { status: 'enviado', at: agora }, updated_at: agora });
  } catch (err) {
    console.warn('[envioUnico] Falha ao confirmar o envio:', err?.message);
  }
}

export async function liberarEnvioUnico(chave, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return;
  try {
    await supabase.from('config').eq('chave', chave).delete();
  } catch (err) {
    console.warn('[envioUnico] Falha ao liberar a reserva:', err?.message);
  }
}
