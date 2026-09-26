import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { CARTA_TEMA_SLOTS } from '@/lib/cartaModelo';

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
    const temaId = String(body?.temaId || '').trim();
    if (!orderId || !temaId) {
      return NextResponse.json({ error: 'orderId e temaId são obrigatórios' }, { status: 400 });
    }
    if (!CARTA_TEMA_SLOTS.some((s) => s.id === temaId)) {
      return NextResponse.json({ error: 'Tema inválido' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    if (!order.hasCartaAccess && !order.cartaAddonPaid) {
      return NextResponse.json({ error: 'Este pedido não tem a Carta paga' }, { status: 403 });
    }

    await updateOrder(orderId, { cartaTemaEscolhido: temaId, updatedAt: new Date().toISOString() }, env);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[carta/choose-theme] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar o tema escolhido' }, { status: 500 });
  }
}
