import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// PostgREST falso para testar consultas montadas pelo cliente real (src/lib/supabase-edge.js).
//
// Os mocks antigos da cota devolviam dados para qualquer `.or()`, e por isso os testes passavam
// enquanto, em produção, o PostgREST recusava aquele or() e a trava contava 0 pedidos
// (23/11/2026). Este fake lê a URL de verdade e entende só os filtros usados pela cota.
// Filtro que ele não conhece => 400, como o servidor real faria com algo malformado.

export function criarFakePostgrest(getRows, { semColunaDigitos = false } = {}) {
  return async (input) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    let rows = [...getRows()];
    if (url.pathname.endsWith('/orders')) {
      const erroSelect = validarSelectOrders(url.searchParams.get('select'));
      if (erroSelect) return new Response(JSON.stringify({ message: erroSelect }), { status: 400 });
    }
    for (const [col, expr] of url.searchParams.entries()) {
      if (['select', 'limit', 'order', 'offset'].includes(col)) continue;
      if (semColunaDigitos && col === 'customer_phone_digits') {
        return new Response(JSON.stringify({ message: 'column orders.customer_phone_digits does not exist' }), { status: 400 });
      }
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
    // No banco esses dois vivem no extras; a consulta os traz com alias de mesmo nome.
    is_second_generation: segunda,
    paid_sku: segunda ? 'segunda_geracao_bonus' : null,
  };
}

// Colunas reais da tabela orders, lidas de supabase/schema.sql + ALTER TABLE das migrações.
// A trava pedia is_second_generation/paid_sku, que não existem: o banco respondia 400 e ela
// contava 0 para todo mundo (23/11/2026). Coluna fora desta lista => 400 também aqui.
function lerColunasDeOrders() {
  const raiz = join(process.cwd(), 'supabase');
  const arquivos = [join(raiz, 'schema.sql')];
  for (const pasta of [raiz, join(raiz, 'migrations')]) {
    try {
      for (const f of readdirSync(pasta)) if (f.endsWith('.sql')) arquivos.push(join(pasta, f));
    } catch { /* pasta ausente */ }
  }
  const cols = new Set();
  for (const arq of arquivos) {
    let sql = '';
    try { sql = readFileSync(arq, 'utf8'); } catch { continue; }
    const bloco = sql.match(/create table (?:if not exists )?(?:public\.)?orders\s*\(([\s\S]*?)\n\);/i);
    if (bloco) {
      for (const linha of bloco[1].split('\n')) {
        const m = linha.match(/^\s+([a-z_][a-z0-9_]*)\s+(text|integer|int|bigint|boolean|timestamptz|numeric|jsonb|uuid|date)/i);
        if (m) cols.add(m[1].toLowerCase());
      }
    }
    for (const m of sql.matchAll(/alter table (?:if exists )?(?:public\.)?orders[\s\S]*?;/gi)) {
      for (const c of m[0].matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) cols.add(c[1].toLowerCase());
    }
  }
  return cols;
}
export const COLUNAS_ORDERS = lerColunasDeOrders();

/** Erro (texto) se o `select` pedir coluna que não existe em orders; null se estiver tudo certo. */
export function validarSelectOrders(select) {
  for (const parte of String(select || '').split(',').map((p) => p.trim()).filter(Boolean)) {
    const expr = parte.includes(':') ? parte.split(':').slice(1).join(':') : parte;
    const base = expr.split('->')[0].trim().toLowerCase();
    if (base === '*' || COLUNAS_ORDERS.has(base)) continue;
    return `column orders.${base} does not exist`;
  }
  return null;
}
