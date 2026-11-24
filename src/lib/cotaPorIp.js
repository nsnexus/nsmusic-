// Trava complementar à cota por telefone/e-mail (ver cotaGeracoes.js).
//
// Quem troca de número, de e-mail ou usa aba anônima começa do zero na cota por contato, mas
// continua saindo pelo mesmo IP. Esta trava conta pedidos NÃO pagos por IP numa janela curta.
//
// O limite é maior que o por contato (8 contra 5) e cada compra paga vinda do mesmo IP soma mais
// 5, porque IP não identifica pessoa: Wi-Fi de casa, empresa e sobretudo operadora móvel (CGNAT)
// compartilham o mesmo IP entre muitos clientes legítimos. Janela de 24 h para não punir por muito tempo.

import { getSupabaseEdge } from './supabase-edge.js';
import { pedidoFoiPago } from './cotaGeracoes.js';

export const COTA_IP_INICIAL = 8;
export const COTA_IP_POR_COMPRA = 5;
export const JANELA_IP_HORAS = 24;

/** Extrai o IP real do cliente (Cloudflare envia em cf-connecting-ip). */
export function obterIpDoCliente(req) {
  const h = req?.headers;
  const bruto = h?.get?.('cf-connecting-ip') || h?.get?.('x-real-ip') || h?.get?.('x-forwarded-for')?.split(',')[0] || '';
  return normalizarIp(bruto);
}

export function normalizarIp(valor) {
  const ip = String(valor || '').trim().toLowerCase();
  if (!ip || ip.length > 45) return '';
  // IPv4 ou IPv6 (somente caracteres válidos) — qualquer outra coisa é descartada.
  return /^[0-9a-f:.]+$/.test(ip) ? ip : '';
}

export function calcularCotaPorIp(pedidos) {
  const lista = Array.isArray(pedidos) ? pedidos : [];
  const pagos = lista.filter(pedidoFoiPago).length;
  const cota = COTA_IP_INICIAL + pagos * COTA_IP_POR_COMPRA;
  return { cota, usados: lista.length, pagos, bloqueado: lista.length >= cota };
}

/**
 * true se este IP já gerou pedidos demais sem pagar nas últimas 24 h.
 * Falha aberta (false) em erro de consulta, igual à cota por contato: não derruba a venda por falha técnica.
 */
export async function isBlockedByIpLimit(ip, env = {}) {
  const ipNorm = normalizarIp(ip);
  if (!ipNorm) return false;
  const supabase = getSupabaseEdge(env);
  if (!supabase) return false;

  try {
    const desde = new Date(Date.now() - JANELA_IP_HORAS * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .select('order_number,payment_status,created_at,is_second_generation:extras->isSecondGeneration,paid_sku:extras->>paidSku')
      .is('deleted_at', null)
      .filter('extras->>clientIp', 'eq', ipNorm)
      .gte('created_at', desde)
      .limit(200);

    if (error) {
      console.warn('[cotaPorIp] Erro ao consultar pedidos por IP:', error.message);
      return false;
    }
    const pedidos = (Array.isArray(data) ? data : [])
      .filter((o) => !o.is_second_generation && o.paid_sku !== 'segunda_geracao_bonus')
      .map((o) => ({ paymentStatus: o.payment_status }));
    return calcularCotaPorIp(pedidos).bloqueado;
  } catch (e) {
    console.warn('[cotaPorIp] Exceção ao verificar IP:', e.message);
    return false;
  }
}
