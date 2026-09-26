import { getSupabaseEdge } from './supabase-edge.js';

/**
 * Gera um número de pedido único com alta entropia e confirma unicidade no Supabase.
 */
export async function generateUniqueOrderNumber(env = {}) {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    const candidate = `NS-${timePart}-${randomPart}-${year}`;

    try {
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        const { data, error } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', candidate)
          .limit(1);

        if (!error && Array.isArray(data)) {
          if (data.length > 0) continue; // Colidiu, tenta próximo candidato
          return candidate; // Único no Supabase
        }
      } else {
        return candidate;
      }
    } catch {
      return candidate;
    }
  }

  // Praticamente impossível de colidir: timestamp em milissegundos + aleatório de alta entropia.
  return `NS-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}-${year}`;
}
