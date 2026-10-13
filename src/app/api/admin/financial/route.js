import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import {
  getFinancialEntries,
  createFinancialEntry,
  deleteFinancialEntry,
  CATEGORIAS_RECEITA,
  CATEGORIAS_DESPESA
} from '@/lib/financial';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'Não autorizado' }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get('mes') || null;
  const tipo = searchParams.get('tipo') || null;

  try {
    const data = await getFinancialEntries(env, { mes, tipo });
    return NextResponse.json({
      ok: true,
      ...data,
      categoriasReceita: CATEGORIAS_RECEITA,
      categoriasDespesa: CATEGORIAS_DESPESA
    });
  } catch (err) {
    console.error('[financial-route] Erro ao listar lançamentos:', err);
    return NextResponse.json({ error: err.message || 'Falha ao buscar lançamentos financeiros' }, { status: 500 });
  }
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'Não autorizado' }, { status: auth.status || 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const created = await createFinancialEntry(env, body);
    return NextResponse.json({ ok: true, entry: created });
  } catch (err) {
    console.error('[financial-route] Erro ao criar lançamento:', err);
    return NextResponse.json({ error: err.message || 'Falha ao salvar lançamento' }, { status: 400 });
  }
}

export async function DELETE(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error || 'Não autorizado' }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Parâmetro id é obrigatório' }, { status: 400 });
  }

  try {
    const res = await deleteFinancialEntry(env, id);
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error('[financial-route] Erro ao excluir lançamento:', err);
    return NextResponse.json({ error: err.message || 'Falha ao excluir lançamento' }, { status: 500 });
  }
}
