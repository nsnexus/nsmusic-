import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { generatePhoneVariants } from '@/lib/orderLookup';

export const runtime = 'edge';

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone')?.trim() || '';
    const email = searchParams.get('email')?.trim() || '';
    const userId = searchParams.get('userId')?.trim() || '';
    const order = searchParams.get('order')?.trim() || searchParams.get('orderNumber')?.trim() || searchParams.get('orderId')?.trim() || '';

    if (!phone && !email && !userId && !order) {
      return NextResponse.json({ error: 'Informe telefone, e-mail, pedido ou userId para busca' }, { status: 400 });
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ orders: [] });
    }

    let q = supabase.from('orders').select('*').is('deleted_at', null);

    if (order) {
      q = q.or(`id.eq.${order},order_number.eq.${order}`);
    } else if (phone) {
      const variants = generatePhoneVariants(phone);
      if (variants.length > 0) {
        q = q.in('customer_phone', variants.slice(0, 25));
      } else {
        return NextResponse.json({ orders: [] });
      }
    } else if (email) {
      q = q.ilike('customer_email', email);
    } else if (userId) {
      q = q.eq('user_id', userId);
    }

    const { data, error } = await q
      .neq('production_status', 'RASCUNHO')
      .neq('production_status', 'CONFIG')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.warn('[my-orders] Erro no Supabase:', error.message);
      return NextResponse.json({ orders: [] });
    }

    const orders = (data || []).map(mapSupabaseOrderToFirestore).filter(Boolean);
    return NextResponse.json({ orders });

  } catch (error) {
    console.error('[my-orders] Erro geral:', error.message);
    return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 });
  }
}
