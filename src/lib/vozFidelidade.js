// Ajustes de fidelidade da voz clonada ("Minha Voz"), editáveis no painel em /admin/voz (21/11/2026).
// Guardados em config 'site' (vozAudioWeight, vozStyleWeight, vozWeirdness). Parâmetros da Kie.ai
// (docs.kie.ai/suno-api/generate-music), todos de 0 a 1 com até 2 casas, só em custom_mode:
//   audio_weight         peso das características do áudio (a voz): mais alto = mais parecido com o cliente
//   style_weight         o quanto segue o estilo pedido; alto demais pode afastar do timbre
//   weirdness_constraint desvio criativo/experimental; baixo = mais previsível

export const FIDELIDADE_VOZ_PADRAO = Object.freeze({ audioWeight: 0.85, styleWeight: 0.75, weirdness: 0.2 });

const CAMPOS = { audioWeight: 'vozAudioWeight', styleWeight: 'vozStyleWeight', weirdness: 'vozWeirdness' };

export function normalizarPeso(valor, padrao) {
  const n = Number(valor);
  if (valor === null || valor === undefined || valor === '' || !Number.isFinite(n)) return padrao;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** Lê os ajustes a partir do valor da config 'site' (objeto já carregado). */
export function fidelidadeDaConfig(config = {}) {
  const out = {};
  for (const [k, campo] of Object.entries(CAMPOS)) out[k] = normalizarPeso(config?.[campo], FIDELIDADE_VOZ_PADRAO[k]);
  return out;
}

/** Campos para gravar na config 'site' a partir do que veio do painel. Ignora o que não foi enviado. */
export function camposFidelidadeParaSalvar(body = {}) {
  const out = {};
  for (const [k, campo] of Object.entries(CAMPOS)) {
    const valor = body?.[campo] ?? body?.[k];
    if (valor !== undefined) out[campo] = normalizarPeso(valor, FIDELIDADE_VOZ_PADRAO[k]);
  }
  return out;
}

/** Lê do banco (config 'site'). Em qualquer falha, devolve o padrão. */
export async function lerFidelidadeVoz(env = {}) {
  try {
    const { getSupabaseEdge } = await import('./supabase-edge.js');
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { ...FIDELIDADE_VOZ_PADRAO };
    const { data } = await supabase.from('config').select('valor').eq('chave', 'site').maybeSingle();
    return fidelidadeDaConfig(data?.valor || {});
  } catch (err) {
    console.warn('[vozFidelidade] Usando o padrão:', err?.message);
    return { ...FIDELIDADE_VOZ_PADRAO };
  }
}
