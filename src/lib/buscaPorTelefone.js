// Busca de um cliente pelo telefone para a aba Limites do painel: quais IPs ele usou nos pedidos,
// de onde esses IPs são (aproximado) e quantos OUTROS telefones já usaram o mesmo IP.
//
// O último número existe para evitar bloqueio errado: IP de operadora móvel é dividido entre
// muita gente, então um IP com vários telefones diferentes provavelmente não é "da pessoa".
//
// O IP vem de `orders.extras.clientIp`, gravado na criação do pedido.

import { getSupabaseEdge } from './supabase-edge.js';
import { normalizarIp } from './cotaPorIp.js';
import { getBlocklist, obterVariacoesTelefone, normalizarTelefoneParaBloqueio } from './blocklist.js';

const MAX_PEDIDOS = 300;
const MAX_IPS = 6;
const GEO_TIMEOUT_MS = 4000;

/** Mesmo número? Compara os 8 últimos dígitos (ignora 55, DDD com zero e o 9 a mais). */
export function mesmoTelefone(a, b) {
  const da = normalizarTelefoneParaBloqueio(a);
  const db = normalizarTelefoneParaBloqueio(b);
  if (da.length < 8 || db.length < 8) return false;
  return da.slice(-8) === db.slice(-8);
}

/** IP de rede interna/reservada não tem localização e nunca deve ser consultado fora. */
export function ipPublico(ip) {
  const v = normalizarIp(ip);
  if (!v) return false;
  if (v.includes(':')) return !(v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80'));
  const p = v.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  if (p[0] === 10 || p[0] === 127 || p[0] === 0) return false;
  if (p[0] === 192 && p[1] === 168) return false;
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
  if (p[0] === 169 && p[1] === 254) return false;
  if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
  return true;
}

/** Agrupa os pedidos por IP, do mais usado para o menos usado. Função pura. */
export function agruparPorIp(pedidos) {
  const mapa = new Map();
  for (const p of pedidos || []) {
    const ip = normalizarIp(p.ip);
    if (!ip) continue;
    const atual = mapa.get(ip) || { ip, pedidos: 0, ultimoUso: null };
    atual.pedidos += 1;
    if (!atual.ultimoUso || String(p.createdAt) > atual.ultimoUso) atual.ultimoUso = p.createdAt || atual.ultimoUso;
    mapa.set(ip, atual);
  }
  return [...mapa.values()].sort((a, b) => b.pedidos - a.pedidos || String(b.ultimoUso).localeCompare(String(a.ultimoUso)));
}

/**
 * Localização aproximada de um IP (cidade do provedor — não é endereço, e em rede móvel costuma
 * apontar para outra cidade). Consulta um serviço público de geolocalização; em qualquer falha
 * devolve null e a tela mostra "indisponível".
 */
export async function localizarIp(ip) {
  if (!ipPublico(ip)) return null;
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(normalizarIp(ip))}?lang=pt-BR`, {
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j || j.success === false) return null;
    const texto = (v) => String(v || '').slice(0, 80);
    return {
      cidade: texto(j.city),
      estado: texto(j.region),
      pais: texto(j.country),
      provedor: texto(j.connection?.isp || j.connection?.org),
    };
  } catch (e) {
    console.warn('[buscaPorTelefone] Geolocalização indisponível:', e.name);
    return null;
  }
}

async function contarOutrosTelefones(supabase, ip, telefone) {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('customer_phone')
      .is('deleted_at', null)
      .filter('extras->>clientIp', 'eq', ip)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error || !Array.isArray(data)) return null;
    const outros = new Set();
    for (const row of data) {
      const d = normalizarTelefoneParaBloqueio(row.customer_phone);
      if (d.length >= 8 && !mesmoTelefone(d, telefone)) outros.add(d.slice(-8));
    }
    return outros.size;
  } catch (e) {
    console.warn('[buscaPorTelefone] Falha ao contar telefones do IP:', e.message);
    return null;
  }
}

export async function buscarPessoaPorTelefone(telefone, env = {}) {
  const digitos = normalizarTelefoneParaBloqueio(telefone);
  if (digitos.length < 8) return { ok: false, motivo: 'telefone_invalido' };

  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ok: false, motivo: 'supabase_ausente' };

  // O telefone é gravado com formatos diferentes (com máscara, com 55, sem 55). O banco filtra
  // pelos 4 últimos dígitos e a comparação fina, pelos 8 últimos, é feita aqui.
  const { data, error } = await supabase
    .from('orders')
    .select('order_number, customer_name, customer_phone, payment_status, created_at, ip:extras->>clientIp')
    .is('deleted_at', null)
    .ilike('customer_phone', `*${digitos.slice(-4)}`)
    .order('created_at', { ascending: false })
    .limit(MAX_PEDIDOS);
  if (error) return { ok: false, motivo: 'consulta_falhou' };

  const pedidos = (Array.isArray(data) ? data : [])
    .filter((row) => mesmoTelefone(row.customer_phone, digitos))
    .map((row) => ({
      numero: row.order_number,
      nome: String(row.customer_name || '').trim(),
      createdAt: row.created_at || null,
      pago: row.payment_status === 'PAGAMENTO_APROVADO' || row.payment_status === 'PAGO',
      ip: normalizarIp(row.ip),
    }));

  if (pedidos.length === 0) return { ok: true, encontrado: false };

  const blocklist = await getBlocklist(env).catch(() => []);
  const variacoes = obterVariacoesTelefone(digitos);
  const telefoneBloqueado = blocklist.some(
    (b) => b.type === 'phone' && variacoes.some((v) => obterVariacoesTelefone(b.value).includes(v)),
  );
  const ipsBloqueados = new Set(blocklist.filter((b) => b.type === 'ip').map((b) => normalizarIp(b.value)));

  const grupos = agruparPorIp(pedidos).slice(0, MAX_IPS);
  const ips = await Promise.all(grupos.map(async (g) => {
    const [local, outrosTelefones] = await Promise.all([
      localizarIp(g.ip),
      contarOutrosTelefones(supabase, g.ip, digitos),
    ]);
    return { ...g, local, outrosTelefones, bloqueado: ipsBloqueados.has(g.ip) };
  }));

  const nomes = [...new Set(pedidos.map((p) => p.nome).filter(Boolean))].slice(0, 5);
  return {
    ok: true,
    encontrado: true,
    pessoa: {
      telefone: digitos,
      nomes,
      pedidos: pedidos.length,
      pagos: pedidos.filter((p) => p.pago).length,
      primeiroPedidoEm: pedidos[pedidos.length - 1].createdAt,
      ultimoPedidoEm: pedidos[0].createdAt,
      semIp: pedidos.filter((p) => !p.ip).length,
      bloqueado: telefoneBloqueado,
    },
    ips,
  };
}
