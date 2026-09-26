// Contadores AO VIVO para a prova social da home.
// Guardados na tabela `config` do Supabase sob a chave 'stats'.
import { getSupabaseEdge } from './supabase-edge.js';

/** +1 geração (um pedido que teve música gerada). */
export async function addGeneration(env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return;

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'stats')
      .maybeSingle();

    const current = data?.valor || { generations: 0, sales: 0 };
    current.generations = (Number(current.generations) || 0) + 1;
    current.updatedAt = new Date().toISOString();

    await supabase.from('config').upsert({
      chave: 'stats',
      valor: current,
      updated_at: current.updatedAt
    });
  } catch (err) {
    console.warn('[liveStats] Falha ao somar geração:', err.message);
  }
}

/** +1 venda (pagamento da MÚSICA aprovado). */
export async function addSale(env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return;

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'stats')
      .maybeSingle();

    const current = data?.valor || { generations: 0, sales: 0 };
    current.sales = (Number(current.sales) || 0) + 1;
    current.updatedAt = new Date().toISOString();

    await supabase.from('config').upsert({
      chave: 'stats',
      valor: current,
      updated_at: current.updatedAt
    });
  } catch (err) {
    console.warn('[liveStats] Falha ao somar venda:', err.message);
  }
}

/**
 * Lê os contadores ao vivo.
 */
export async function readLiveStats(env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { generations: 0, sales: 0 };

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'stats')
      .maybeSingle();

    const stats = data?.valor || {};
    return {
      generations: Number(stats.generations) || 0,
      sales: Number(stats.sales) || 0,
    };
  } catch (err) {
    console.warn('[liveStats] Falha ao ler contadores:', err.message);
    return { generations: 0, sales: 0 };
  }
}
