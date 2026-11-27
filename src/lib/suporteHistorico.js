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

export async function registrarConversa({ conversaId, orderId, mensagens, marcas, telefone }, env = {}) {
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
    // Sem pedido aberto, guarda o WhatsApp que o cliente digitou no chat (só para achar a conversa).
    p_phone: pedido?.customerPhone
      ? String(pedido.customerPhone).replace(/\D/g, '')
      : (/^\d{10,13}$/.test(String(telefone || '')) ? String(telefone) : ''),
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
    // Conversa com só a saudação do bot (abriu e saiu) não é atendimento.
    .gt('total_mensagens', 1)
    .order('atualizado_em', { ascending: false })
    .limit(Math.min(Math.max(Number(limite) || 40, 1), 100));
  const variantes = telefone ? generatePhoneVariants(telefone).map((v) => String(v).replace(/\D/g, '')) : [];
  if (telefone && variantes.length) q = q.in('customer_phone', Array.from(new Set(variantes)).slice(0, 25));
  if (antes && !Number.isNaN(Date.parse(antes))) q = q.lt('atualizado_em', antes);
  const { data, error } = await q;
  if (error) return { ok: false, motivo: 'falha_na_consulta', erro: error.message };
  return { ok: true, conversas: Array.isArray(data) ? data : [] };
}

const chaveDoCliente = (c) => {
  const d = String(c?.customer_phone || '').replace(/\D/g, '');
  if (d.length < 10) return `conversa:${c?.id}`;
  return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
};

/**
 * Um item por CLIENTE (mesmo WhatsApp) na lista do painel, somando as vezes que ele abriu o chat
 * (pedido do dono do estúdio em 27/11/2026). Conversa sem telefone fica sozinha. Função pura;
 * a ordem de entrada (mais recente primeiro) é mantida.
 */
export function agruparPorCliente(conversas) {
  const grupos = new Map();
  for (const c of conversas || []) {
    const chave = chaveDoCliente(c);
    const g = grupos.get(chave);
    if (!g) {
      grupos.set(chave, { ...c, conversas: 1, marcas: Array.isArray(c.marcas) ? [...c.marcas] : [] });
      continue;
    }
    g.conversas += 1;
    g.total_mensagens = (Number(g.total_mensagens) || 0) + (Number(c.total_mensagens) || 0);
    if (!g.customer_name && c.customer_name) g.customer_name = c.customer_name;
    if (!g.order_id && c.order_id) g.order_id = c.order_id;
    if (c.criado_em && (!g.criado_em || c.criado_em < g.criado_em)) g.criado_em = c.criado_em;
    for (const m of Array.isArray(c.marcas) ? c.marcas : []) if (!g.marcas.includes(m)) g.marcas.push(m);
  }
  return [...grupos.values()];
}

/**
 * Atendimento completo do cliente da conversa `id`: todas as conversas do mesmo WhatsApp (até 30),
 * em ordem, com um separador entre elas. Sem telefone, só a própria conversa.
 */
export async function lerAtendimentoDoCliente(id, env = {}) {
  const base = await lerConversa(id, env);
  if (!base.ok) return base;
  const variacoes = variacoesDoTelefone(base.conversa.customer_phone);
  if (variacoes.length === 0) return base;
  const supabase = getSupabaseEdge(env);
  const { data, error } = await supabase.from('suporte_conversas')
    .select('*')
    .in('customer_phone', variacoes)
    .order('criado_em', { ascending: false })
    .limit(30);
  if (error || !Array.isArray(data) || data.length < 2) return base;
  const ordem = data.slice().reverse();
  const mensagens = ordem.flatMap((c, i) => [
    ...(i > 0 ? [{ de: 'sistema', tipo: 'separador', texto: 'Cliente voltou ao chat', em: c.criado_em }] : []),
    ...(Array.isArray(c.mensagens) ? c.mensagens : []),
  ]);
  const ultima = ordem[ordem.length - 1];
  return {
    ok: true,
    conversa: {
      ...ultima,
      id: base.conversa.id,
      customer_name: ordem.map((c) => c.customer_name).filter(Boolean).pop() || null,
      order_id: ordem.map((c) => c.order_id).filter(Boolean).pop() || null,
      mensagens,
      conversas: ordem.length,
    },
  };
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

/** Variações do mesmo WhatsApp como ficam gravadas (com e sem o 55 do Brasil). */
export function variacoesDoTelefone(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length < 10) return [];
  const sem55 = d.startsWith('55') && d.length >= 12 ? d.slice(2) : d;
  return [...new Set([d, sem55, `55${sem55}`])];
}

/**
 * Conversas ANTERIORES do mesmo cliente (pelo WhatsApp), para a IA não começar do zero quando ele
 * volta ao chat (pedido do dono do estúdio em 26/11/2026). Só texto, em ordem cronológica, das
 * últimas `dias`, sem a conversa atual. Nunca lança: sem banco ou com erro devolve [].
 * @returns {Promise<Array<{de: 'eu'|'bot', texto: string, em: string}>>}
 */
export async function historicoDoCliente(telefone, { excetoConversa = '', dias = 7, max = 30 } = {}, env = {}, deps = {}) {
  const variacoes = variacoesDoTelefone(telefone);
  if (variacoes.length === 0) return [];
  const supabase = (deps.getSupabaseEdge || getSupabaseEdge)(env);
  if (!supabase) return [];
  try {
    const desde = new Date(Date.now() - dias * 86400000).toISOString();
    const { data, error } = await supabase.from('suporte_conversas')
      .select('id,mensagens,atualizado_em')
      .in('customer_phone', variacoes)
      .gt('atualizado_em', desde)
      .order('atualizado_em', { ascending: false })
      .limit(6);
    if (error || !Array.isArray(data)) return [];
    return data
      .filter((c) => c.id !== excetoConversa)
      .reverse()
      .flatMap((c) => (Array.isArray(c.mensagens) ? c.mensagens : []))
      .filter((m) => (m?.de === 'eu' || m?.de === 'bot') && typeof m.texto === 'string' && m.texto.trim())
      .map((m) => ({ de: m.de, texto: (m.tipo === 'letra' ? `[letra] ${m.texto}` : m.texto).slice(0, 400), em: String(m.em || '') }))
      .slice(-max);
  } catch (err) {
    console.warn('[suporteHistorico] Falha ao ler as conversas anteriores:', err?.message);
    return [];
  }
}
