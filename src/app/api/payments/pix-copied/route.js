import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const dados = await getOrder(orderId, env);
    if (!dados) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const agora = new Date().toISOString();
    await updateOrder(orderId, {
      ...(dados.pixCopiedAt ? {} : { pixCopiedAt: agora }),
      pixCopiedLastAt: agora,
      updatedAt: agora,
    }, env);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[payments/pix-copied] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
