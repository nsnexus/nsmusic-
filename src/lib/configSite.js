// Configuração editável pelo painel, sem deploy.
// Mora em `config` (chave: 'site') no Supabase. Escrita só pela rota /api/admin/config, com requireAdmin.

export const WHATSAPP_SUPORTE_PADRAO = '5594991081351';

export const CONFIG_DOC = { colecao: 'config', id: 'site' };

// Aceita o que o admin digitar ("(94) 99106-4043", "+55 94 9910-6043") e devolve só dígitos com o
// 55 na frente, que é o formato que o wa.me exige.
export function normalizarNumeroWhatsapp(valor) {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (digitos.startsWith('55') && (digitos.length === 12 || digitos.length === 13)) return digitos;
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return '';
}

export async function lerConfigSite(env = {}) {
  try {
    if (typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/admin/config');
        if (res.ok) {
          const json = await res.json();
          if (json?.whatsappSuporte) {
            return {
              whatsappSuporte: json.whatsappSuporte,
              agentEnabled: json.agentEnabled !== false,
              sunoPrimaryProvider: json.sunoPrimaryProvider || null,
              contingencyMode: json.contingencyMode === true
            };
          }
        }
      } catch {}
    }

    const { getSupabaseEdge } = await import('./supabase-edge.js');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data } = await supabase
        .from('config')
        .select('valor')
        .eq('chave', 'site')
        .maybeSingle();

      if (data?.valor) {
        return {
          whatsappSuporte: data.valor.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
          agentEnabled: data.valor.agentEnabled !== false,
          sunoPrimaryProvider: data.valor.sunoPrimaryProvider || null,
          contingencyMode: data.valor.contingencyMode === true,
          ...data.valor
        };
      }
    }

    return {
      whatsappSuporte: WHATSAPP_SUPORTE_PADRAO,
      agentEnabled: true,
      sunoPrimaryProvider: null,
      contingencyMode: false
    };
  } catch (e) {
    console.warn('[config] não foi possível ler config/site:', e.message);
    return {
      whatsappSuporte: WHATSAPP_SUPORTE_PADRAO,
      agentEnabled: true,
      sunoPrimaryProvider: null,
      contingencyMode: false
    };
  }
}
