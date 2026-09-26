import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const { orderId, ...fields } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const updateData = { updatedAt: new Date().toISOString() };
    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        updateData[key] = val;
      }
    }

    await updateOrder(orderId, updateData, env);

    return NextResponse.json({ success: true, orderId, updated: updateData }, { status: 200 });

  } catch (error) {
    console.error("Erro na API /api/orders/update:", error);
    return NextResponse.json({ error: error.message || 'Erro ao atualizar pedido' }, { status: 500 });
  }
}

