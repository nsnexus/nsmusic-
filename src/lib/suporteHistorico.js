// Histórico do chat de suporte (/suporte) para a aba "Atendimentos" do painel.
// Tabela e função em supabase/migrations/20261125_suporte_conversas.sql.
//
// A página manda, em lotes, as mensagens que mostrou (do cliente e do bot) — o que o cliente viu
// é o que fica registrado. Nome e telefone vêm do PEDIDO no servidor, nunca do corpo.

import { getSupabaseEdge } from './supabase-edge.js';
import { getOrder } from './supabaseDb.js';
import { generatePhoneVariants } from './orderLookup.js';

export const MARCAS = new Set([
  'ritmo', 'letra', 'baixar', 'pagamento', 'criar', 'humano', 'ajuste_pix', 'ajuste_pago',
  'pedido_pago', 'musica_nova', 'pedido_criado', 'ja_paguei',
]);
const TIPOS = new Set(['texto', 'letra', 'audio', 'arquivo', 'link', 'pix', 'imagem', 'whatsapp']);
const MAX_LOTE = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corta = (v, n) => (typeof v === 'string' ? v.slice(0, n) : undefined);

/** Limpa o lote vindo da página: só campos conhecidos, com tamanho limitado. */
export function limparLote(lista) {
  return (Array.isArray(lista) ? lista : []).slice(0, MAX_LOTE)
    .filter((m) => m && TIPOS.has(m.tipo) && (m.de === 'eu' || m.de === 'bot'))
    .map((m) => {
      const item = { de: m.de, tipo: m.tipo, em: corta(m.em, 30) || new Date().toISOString() };
      const texto = corta(m.texto, 4000);
      const titulo = corta(m.titulo, 200);
      const nome = corta(m.nome, 200);
      if (texto) item.texto = texto;
      if (titulo) item.titulo = titulo;
      if (nome) item.nome = nome;
      if (Array.isArray(m.opcoes)) item.opcoes = m.opcoes.slice(0, 12).map((o) => corta(o, 80)).filter(Boolean);
      return item;
    });
}

export async function registrarConversa({ conversaId, orderId, mensagens, marcas }, env = {}) {
  if (!UUID.test(String(conversaId || ''))) return { ok: false, motivo: 'conversa_invalida' };
  const lote = limparLote(mensagens);
  const marcasValidas = (Array.isArray(marcas) ? marcas : []).filter((m) => MARCAS.has(m)).slice(0, 12);
  if (lote.length === 0 && marcasValidas.length === 0) return { ok: true };

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, motivo: 'sem_banco' };

  let pedido = null;
  if (orderId) pedido = await getOrder(orderId, env).catch(() => null);

  const { error } = await supabase.rpc('suporte_registrar', {
    p_id: conversaId,
    p_order_id: pedido?.id || '',
    p_phone: pedido?.customerPhone ? String(pedido.customerPhone).replace(/\D/g, '') : '',
    p_nome: pedido?.customerName || '',
    p_mensagens: lote,
    p_marcas: marcasValidas,
  });
  if (error) {
    console.warn('[suporteHistorico] Falha ao gravar a conversa:', error.message);
    return { ok: false, motivo: 'falha_ao_gravar' };
  }
  return { ok: true };
}

/** Lista para o painel (mais recentes primeiro), com busca por telefone. */
export async function listarConversas({ telefone = '', antes = '', limite = 40 } = {}, env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, motivo: 'sem_banco' };
  let q = supabase.from('suporte_conversas')
    .select('id,order_id,customer_phone,customer_name,total_mensagens,marcas,criado_em,atualizado_em')
    .order('atualizado_em', { ascending: false })
    .limit(Math.min(Math.max(Number(limite) || 40, 1), 100));
  const variantes = telefone ? generatePhoneVariants(telefone).map((v) => String(v).replace(/\D/g, '')) : [];
  if (telefone && variantes.length) q = q.in('customer_phone', Array.from(new Set(variantes)).slice(0, 25));
  if (antes && !Number.isNaN(Date.parse(antes))) q = q.lt('atualizado_em', antes);
  const { data, error } = await q;
  if (error) return { ok: false, motivo: 'falha_na_consulta', erro: error.message };
  return { ok: true, conversas: Array.isArray(data) ? data : [] };
}

export async function lerConversa(id, env = {}) {
  if (!UUID.test(String(id || ''))) return { ok: false, motivo: 'conversa_invalida' };
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, motivo: 'sem_banco' };
  const { data, error } = await supabase.from('suporte_conversas').select('*').eq('id', id).maybeSingle();
  if (error) return { ok: false, motivo: 'falha_na_consulta' };
  if (!data) return { ok: false, motivo: 'nao_encontrada' };
  return { ok: true, conversa: data };
}
