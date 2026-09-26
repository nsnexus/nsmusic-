import { getSupabaseEdge } from './supabase-edge.js';

// Registro de "reset de cota": quando o estúdio libera um cliente que estourou o limite de
// gerações, guardamos a data do reset. A partir dela, pedidos anteriores deixam de contar
// (ver calcularCota em src/lib/cotaGeracoes.js) — nenhum pedido é apagado, o histórico continua
// inteiro para consulta e faturamento.
//
// Armazenado na tabela `config` do Supabase sob a chave 'cota_resets'.
export const PREFIXO = 'config_cotareset_';

export function normalizarTelefone(telefone) {
  return String(telefone || '').replace(/\D/g, '');
}

export async function idDoReset(telefone) {
  const digitos = normalizarTelefone(telefone);
  if (!digitos) return '';

  const bytes = new TextEncoder().encode(digitos);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${PREFIXO}${hex.slice(0, 32)}`;
}

/**
 * @returns {Promise<string>} data ISO do último reset, ou '' se nunca houve.
 */
export async function lerResetDeCota(telefone, env = {}) {
  const id = await idDoReset(telefone);
  if (!id) return '';
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return '';

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'cota_resets')
      .maybeSingle();

    const resets = data?.valor || {};
    return String(resets[id]?.resetAt || '');
  } catch (err) {
    console.warn('[cotaReset] Falha ao ler reset de cota:', err.message);
    return '';
  }
}

export async function registrarResetDeCota(telefone, { porQuem = '' } = {}, env = {}) {
  const id = await idDoReset(telefone);
  if (!id) return { ok: false, error: 'telefone_invalido' };

  const agora = new Date().toISOString();
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { ok: false, error: 'supabase_indisponivel' };

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'cota_resets')
      .maybeSingle();

    const resets = { ...(data?.valor || {}) };
    resets[id] = {
      resetAt: agora,
      telefoneFinal: normalizarTelefone(telefone).slice(-4),
      resetPor: porQuem || null,
      updatedAt: agora,
    };

    await supabase
      .from('config')
      .upsert({
        chave: 'cota_resets',
        valor: resets,
        updated_at: agora,
      });

    return { ok: true, resetAt: agora };
  } catch (err) {
    console.warn('[cotaReset] Falha ao gravar reset de cota:', err.message);
    return { ok: false, error: 'falha_ao_gravar' };
  }
}

/**
 * Lê TODOS os resets registrados de uma vez.
 * @returns {Promise<Map<string, string>>} id do documento -> data ISO do reset
 */
export async function lerTodosOsResets(env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return new Map();

    const { data } = await supabase
      .from('config')
      .select('valor')
      .eq('chave', 'cota_resets')
      .maybeSingle();

    const resets = data?.valor || {};
    const mapa = new Map();
    for (const [k, v] of Object.entries(resets)) {
      if (v?.resetAt) {
        mapa.set(k, String(v.resetAt));
      }
    }
    return mapa;
  } catch (err) {
    console.warn('[cotaReset] Falha ao listar resets:', err.message);
    return new Map();
  }
}
