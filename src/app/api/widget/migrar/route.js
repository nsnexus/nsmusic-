import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge, resolveSupabaseConfig } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// TEMPORÁRIA: cria a tabela metricas_diarias no Supabase da VPS (o dono não tinha acesso fácil ao
// SQL). Roda SÓ o SQL fixo abaixo (o mesmo de supabase/migrations/20261117_metricas_diarias.sql),
// pela API de SQL do próprio Supabase (postgres-meta, /pg/query), com a chave de serviço do app.
// Não aceita SQL de fora. Autenticada pela WIDGET_TOKEN. Remover depois de usada.
const SQL = `
create table if not exists metricas_diarias (
  dia              date primary key,
  faturamento      numeric(12,2) not null default 0,
  vendas           integer       not null default 0,
  pedidos_criados  integer       not null default 0,
  musicas_geradas  integer       not null default 0,
  gasto_kie        numeric(12,2) not null default 0,
  gasto_whatsapp   numeric(12,2) not null default 0,
  receita_hora     jsonb         not null default '[]'::jsonb,
  criados_hora     jsonb         not null default '[]'::jsonb,
  pagos_hora       jsonb         not null default '[]'::jsonb,
  tem_receita      boolean       not null default false,
  tem_coorte       boolean       not null default false,
  calculado_em     timestamptz   not null default now()
);
alter table metricas_diarias enable row level security;
notify pgrst, 'reload schema';
`;

function iguais(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = { ...ctx.env };
  } catch (e) { /* fora da Cloudflare */ }

  const esperado = String(env.WIDGET_TOKEN || process.env.WIDGET_TOKEN || '').trim();
  const recebido = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (esperado.length < 32 || !iguais(recebido, esperado)) {
    return NextResponse.json({ error: 'Chave inválida.' }, { status: 401 });
  }

  const { url, serviceKey } = resolveSupabaseConfig(env);
  if (!url || !serviceKey) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });

  let passo = 'criar';
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/pg/query`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SQL }),
      signal: AbortSignal.timeout(20000),
    });
    const texto = (await res.text().catch(() => '')).slice(0, 300);
    if (!res.ok) return NextResponse.json({ ok: false, passo, status: res.status, resposta: texto }, { status: 502 });

    passo = 'conferir';
    await new Promise((r) => setTimeout(r, 1500)); // tempo para a API recarregar o esquema
    const { error } = await getSupabaseEdge(env).from('metricas_diarias').select('dia').limit(1);
    return NextResponse.json({ ok: !error, passo, tabelaVisivel: !error, erro: error?.message?.slice(0, 200) || null });
  } catch (e) {
    return NextResponse.json({ ok: false, passo, erro: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
