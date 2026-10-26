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

    const safeOrder = sanitizeOrderForResponse(order);

    return NextResponse.json(
      { order: safeOrder },
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

/**
 * Remove URLs brutas de CDN/Suno e metadados internos de pedidos ainda não pagos.
 * Assegura que o cliente ouça apenas via áudio proxy sem expor o link de download integral.
 */
export function sanitizeOrderForResponse(order) {
  if (!order || typeof order !== 'object') return order;

  const isPaid = order.paymentStatus === 'PAGO' || order.paymentStatus === 'PAGAMENTO_APROVADO';
  if (isPaid) return order;

  const sanitized = { ...order };
  const targetId = sanitized.id || sanitized.orderNumber;

  if (Array.isArray(sanitized.audioFiles) && sanitized.audioFiles.length > 0) {
    sanitized.audioFiles = sanitized.audioFiles.map((_, idx) => `/api/audio/proxy?orderId=${encodeURIComponent(targetId)}&faixa=${idx}`);
    sanitized.audioUrl = sanitized.audioFiles[0];
  } else if (sanitized.audioUrl) {
    sanitized.audioUrl = `/api/audio/proxy?orderId=${encodeURIComponent(targetId)}&faixa=0`;
  }

  if (Array.isArray(sanitized.audioHistory)) {
    sanitized.audioHistory = sanitized.audioHistory.map((item, idx) => ({
      ...item,
      audioUrl: `/api/audio/proxy?orderId=${encodeURIComponent(targetId)}&faixa=${idx}`,
      tracks: Array.isArray(item.tracks)
        ? item.tracks.map((t, tIdx) => ({
            ...t,
            url: `/api/audio/proxy?orderId=${encodeURIComponent(targetId)}&faixa=${tIdx}`,
            audio_url: `/api/audio/proxy?orderId=${encodeURIComponent(targetId)}&faixa=${tIdx}`,
          }))
        : item.tracks,
    }));
  }

  if (sanitized.extras && typeof sanitized.extras === 'object') {
    const { rawSunoPayload, webhookLogs, internalTokens, ...safeExtras } = sanitized.extras;
    sanitized.extras = safeExtras;
  }

  return sanitized;
}
