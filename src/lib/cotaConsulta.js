// Busca dos pedidos de uma pessoa para a cota de gerações grátis (ver cotaGeracoes.js).
//
// Bug encontrado em 23/11/2026: a consulta antiga montava
//   or=(customer_phone.in.("(11) 98700-4296","11 98700-4296",...),customer_email.eq...)
// com parênteses e espaços dentro de um or() — o PostgREST da VPS recusava, a trava "falhava
// aberta" e contava 0 pedidos para TODO MUNDO. Cliente com 11 músicas sem pagar nunca era barrado.
//
// Agora a busca é pela coluna gerada customer_phone_digits (só números, com índice; ver
// supabase/correcoes.sql), com variações só de dígitos, e o e-mail em consulta separada.
// Nada de or() e nada de caractere especial na URL.

import { generatePhoneVariants } from './orderLookup.js';

const COLUNAS = 'id, order_number, payment_status, created_at, is_second_generation, paid_sku';

/** Variações só de dígitos: com/sem 55 e com/sem o 9º dígito. */
export function variantesDigitos(phone) {
  return [...new Set(generatePhoneVariants(phone).filter((v) => /^\d{10,13}$/.test(v)))];
}

/**
 * Pedidos não excluídos do telefone e/ou e-mail, sem duplicata.
 * @returns {Promise<{pedidos: Array<object>, erro: string|null}>}
 */
export async function buscarPedidosDaPessoa(supabase, { phone = '', email = '' } = {}) {
  const digitos = variantesDigitos(phone);
  const emailNorm = String(email || '').trim().toLowerCase();
  const consultas = [];

  if (digitos.length > 0) {
    consultas.push((async () => {
      const r = await supabase.from('orders').select(COLUNAS).is('deleted_at', null).in('customer_phone_digits', digitos).limit(500);
      if (!r?.error) return r;
      // Plano B: a coluna customer_phone_digits pode não existir no banco (supabase/correcoes.sql
      // não aplicado). Mesma busca que o robô do WhatsApp usa e que funciona em produção
      // (orderLookup.findOrdersByPhone): customer_phone em todas as variações, sem or().
      const variantes = generatePhoneVariants(phone);
      const r2 = await supabase.from('orders').select(COLUNAS).is('deleted_at', null).in('customer_phone', variantes).limit(500);
      return r2?.error
        ? { data: null, error: { message: `digitos: ${r.error.message} | telefone: ${r2.error.message}` } }
        : { ...r2, planoB: true };
    })());
  }
  if (emailNorm.includes('@')) {
    consultas.push(
      supabase.from('orders').select(COLUNAS).is('deleted_at', null).eq('customer_email', emailNorm).limit(500)
    );
  }
  if (consultas.length === 0) return { pedidos: [], erro: null };

  const resultados = await Promise.all(consultas);
  const erro = resultados.find((r) => r?.error)?.error?.message || null;
  const planoB = resultados.some((r) => r?.planoB);
  const vistos = new Map();
  for (const r of resultados) {
    for (const row of Array.isArray(r?.data) ? r.data : []) {
      vistos.set(row.id || row.order_number, row);
    }
  }

  const pedidos = [...vistos.values()]
    // A 2ª geração (bônus) de um pedido pago não conta para a cota.
    .filter((o) => !o.is_second_generation && o.paid_sku !== 'segunda_geracao_bonus')
    .map((o) => ({ orderNumber: o.order_number, paymentStatus: o.payment_status, createdAt: o.created_at }));

  return { pedidos, erro, planoB };
}
