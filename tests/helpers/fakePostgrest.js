// PostgREST falso para testar consultas montadas pelo cliente real (src/lib/supabase-edge.js).
//
// Os mocks antigos da cota devolviam dados para qualquer `.or()`, e por isso os testes passavam
// enquanto, em produção, o PostgREST recusava aquele or() e a trava contava 0 pedidos
// (23/11/2026). Este fake lê a URL de verdade e entende só os filtros usados pela cota.
// Filtro que ele não conhece => 400, como o servidor real faria com algo malformado.

export function criarFakePostgrest(getRows) {
  return async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    let rows = [...getRows()];
    for (const [col, expr] of url.searchParams.entries()) {
      if (['select', 'limit', 'order', 'offset'].includes(col)) continue;
      if (col === 'or') {
        return new Response(JSON.stringify({ message: 'failed to parse logic tree' }), { status: 400 });
      }
      if (expr === 'is.null') {
        rows = rows.filter((r) => r[col] == null);
      } else if (expr.startsWith('eq.')) {
        rows = rows.filter((r) => String(r[col]) === expr.slice(3));
      } else if (expr.startsWith('in.(') && expr.endsWith(')')) {
        const valores = expr.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
        rows = rows.filter((r) => valores.includes(String(r[col])));
      } else {
        return new Response(JSON.stringify({ message: `filtro não suportado: ${col}=${expr}` }), { status: 400 });
      }
    }
    return new Response(JSON.stringify(rows), { status: 200 });
  };
}

/** Linha de pedido como está no Supabase (customer_phone_digits é coluna gerada). */
export function linhaPedido({ n, phone = '', email = '', pago = false, segunda = false }) {
  return {
    id: `id-${n}`,
    order_number: String(n),
    customer_phone: phone,
    customer_phone_digits: String(phone).replace(/\D/g, ''),
    customer_email: email,
    payment_status: pago ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
    created_at: new Date().toISOString(),
    deleted_at: null,
    is_second_generation: segunda,
    paid_sku: segunda ? 'segunda_geracao_bonus' : null,
  };
}
