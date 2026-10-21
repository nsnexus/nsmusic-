import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { buildOrderAudioHistory } from '@/lib/audioHistory';

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

    // Enriquece com o histórico consolidado de versões de áudio
    try {
      const supabase = getSupabaseEdge(env);
      let tasks = [];
      if (supabase && order.id) {
        const { data } = await supabase
          .from('suno_tasks')
          .select('id, order_id, status, provider, created_at, result')
          .eq('order_id', order.id)
          .eq('status', 'COMPLETED')
          .order('created_at', { ascending: false });
        if (Array.isArray(data)) {
          tasks = data;
        }
      }
      order.audioHistory = buildOrderAudioHistory(order, tasks);
    } catch (histErr) {
      console.warn('[api/orders/[id]] Falha ao montar histórico de áudio:', histErr?.message);
      order.audioHistory = buildOrderAudioHistory(order, []);
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
