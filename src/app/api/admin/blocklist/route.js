import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getBlocklist, addBlockContact, removeBlockContact } from '@/lib/blocklist';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const blocklist = await getBlocklist(env);
    return NextResponse.json({ blocklist });
  } catch (err) {
    console.error('[admin/blocklist] Erro ao listar bloqueados:', err.message);
    return NextResponse.json({ error: 'Falha ao consultar lista de bloqueados.' }, { status: 500 });
  }
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const { phone, email, name, reason } = body;

    const res = await addBlockContact({
      phone,
      email,
      name,
      reason,
      blockedBy: auth.email || auth.uid || 'admin',
    }, env);

    return NextResponse.json(res);
  } catch (err) {
    console.error('[admin/blocklist] Erro ao adicionar bloqueio:', err.message);
    return NextResponse.json({ error: err.message || 'Falha ao salvar bloqueio.' }, { status: 400 });
  }
}

export async function DELETE(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });

  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id') || searchParams.get('value');

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.id || body?.value;
    }

    if (!id) {
      return NextResponse.json({ error: 'Identificador do bloqueio é obrigatório.' }, { status: 400 });
    }

    const res = await removeBlockContact(id, env);
    return NextResponse.json(res);
  } catch (err) {
    console.error('[admin/blocklist] Erro ao remover bloqueio:', err.message);
    return NextResponse.json({ error: err.message || 'Falha ao remover bloqueio.' }, { status: 400 });
  }
}
