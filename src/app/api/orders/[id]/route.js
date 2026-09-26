import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';

export const runtime = 'edge';

export async function GET(req, { params }) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const orderId = params?.id;
    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido é obrigatório' }, { status: 400 });
    }

    const order = await findOrderByIdOrNumber(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    return NextResponse.json(
      { order },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    );
  } catch (err) {
    console.error('[api/orders/[id]] Erro:', err.message);
    return NextResponse.json({ error: 'Erro ao buscar pedido' }, { status: 500 });
  }
}
