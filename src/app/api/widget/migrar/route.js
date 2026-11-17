import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge, resolveSupabaseConfig } from '@/lib/supabase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// TEMPORÁRIA: cria a coluna metricas_diarias.detalhes no Supabase da VPS (o dono não tem acesso
// fácil ao SQL). Roda SÓ o SQL fixo abaixo (o mesmo de supabase/migrations/20261117b_...detalhes.sql),
// pela API de SQL do próprio Supabase (postgres-meta, /pg/query), com a chave de serviço do app.
// Não aceita SQL de fora. Autenticada pela WIDGET_TOKEN. Remover depois de usada.
const SQL = `
alter table metricas_diarias add column if not exists detalhes jsonb not null default '{}'::jsonb;
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
    const { error } = await getSupabaseEdge(env).from('metricas_diarias').select('dia,detalhes').limit(1);
    return NextResponse.json({ ok: !error, passo, tabelaVisivel: !error, erro: error?.message?.slice(0, 200) || null });
  } catch (e) {
    return NextResponse.json({ ok: false, passo, erro: String(e?.message || e).slice(0, 200) }, { status: 502 });
  }
}
