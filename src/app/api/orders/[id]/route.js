import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { buildOrderAudioHistory } from '@/lib/audioHistory';
import { requireAdmin } from '@/lib/auth';

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

    // As consultas abaixo (histórico de áudio, pedido vinculado e checagem de admin) são
    // independentes e rodam AO MESMO TEMPO. Antes rodavam uma depois da outra; com o banco lento,
    // somavam 20-28 s e a página de entrega desistia (20/11/2026).
    const pedidoBase = { ...order };

    const historicoPromise = (async () => {
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
      return buildOrderAudioHistory(pedidoBase, tasks);
    } catch (histErr) {
      console.warn('[api/orders/[id]] Falha ao montar histórico de áudio:', histErr?.message);
      return buildOrderAudioHistory(pedidoBase, []);
    }
    })();

    const adminPromise = (async () => {
      try {
        const auth = await requireAdmin(req, env);
        return Boolean(auth?.ok);
      } catch (e) {
        return false;
      }
    })();

    const vinculadoPromise = (async () => {
    try {
      const parentId = order.parentOrderId;
      const childId = order.secondGenerationOrderId || order.segundaGeracaoOrderId;
      let relatedId = parentId || childId;

      if (!relatedId) {
        const supabase = getSupabaseEdge(env);
        if (supabase) {
          // Uma consulta só, pelo id OU pelo número (antes eram duas em sequência).
          const refs = [order.id, order.orderNumber].filter((v) => v && /^[A-Za-z0-9_-]+$/.test(String(v)));
          if (refs.length > 0) {
            const { data: rows } = await supabase
              .from('orders')
              .select('id')
              .or(refs.map((r) => `extras->>parentOrderId.eq.${r}`).join(','))
              .limit(1);
            if (rows && rows[0]?.id) relatedId = rows[0].id;
          }
        }
      }

      if (relatedId) {
        const related = await findOrderByIdOrNumber(relatedId, env);
        if (related) {
          const parentIsPaid = related.paymentStatus === 'PAGO' || related.paymentStatus === 'PAGAMENTO_APROVADO';
          // Auto-reconciliação da 2ª geração: se este pedido for a 2ª geração de um pedido já pago, ele herda a aprovação
          if ((parentId || order.isSecondGeneration || order.origem === 'segunda_geracao' || order.paidSku === 'segunda_geracao_bonus') && parentIsPaid) {
            order.isSecondGeneration = true;
            if (order.paymentStatus !== 'PAGO' && order.paymentStatus !== 'PAGAMENTO_APROVADO') {
              order.paymentStatus = 'PAGAMENTO_APROVADO';
              order.paidSku = order.paidSku || 'segunda_geracao_bonus';
              try {
                const { updateOrder } = await import('@/lib/supabaseDb');
                await updateOrder(order.id, {
                  paymentStatus: 'PAGAMENTO_APROVADO',
                  paidSku: 'segunda_geracao_bonus',
                  isSecondGeneration: true,
                  hasVideoAccess: Boolean(order.hasVideoAccess || related.hasVideoAccess || related.videoAddonPaid),
                  hasCartaAccess: Boolean(order.hasCartaAccess || related.hasCartaAccess || related.cartaAddonPaid),
                  hasRetrospectivaAccess: Boolean(order.hasRetrospectivaAccess || related.hasRetrospectivaAccess || related.retrospectivaAddonPaid),
                }, env);
              } catch (autoApproveErr) {
                console.warn('[api/orders/[id]] Falha ao sincronizar aprovação herdada no banco:', autoApproveErr?.message);
              }
            }
          }
          order.relatedOrder = sanitizeOrderForResponse(related);
          if (related.parentOrderId === order.id || related.parentOrderId === order.orderNumber || (!parentId && !order.isSecondGeneration)) {
            const childAudioFiles = Array.isArray(related.audioFiles) && related.audioFiles.length > 0 ? related.audioFiles : (related.audioUrl ? [related.audioUrl] : []);
            const childHasAudio = childAudioFiles.length > 0 || ['AUDIO_GERADO', 'CONCLUIDO', 'FINALIZADO', 'ENTREGUE'].includes(related.productionStatus);
            const childIsGenerating = !childHasAudio && ['GERANDO_AUDIO', 'EM_PRODUCAO', 'PROCESSANDO', 'GERANDO'].includes(related.productionStatus);

            order.secondGeneration = {
              id: related.id,
              orderNumber: related.orderNumber,
              customerName: related.customerName,
              productionStatus: related.productionStatus,
              audioUrl: related.audioUrl,
              audioFiles: childAudioFiles,
              lyrics: related.lyrics,
              musicStyle: related.musicStyle,
              musicMood: related.musicMood,
              voiceType: related.voiceType,
              sunoPrompt: related.sunoPrompt,
              sunoTaskId: related.sunoTaskId,
              sunoProvider: related.sunoProvider,
              createdAt: related.createdAt,
              hasAudio: childHasAudio,
              isGenerating: childIsGenerating,
              isDraft: !childHasAudio && !childIsGenerating,
            };
            order.secondOrderCreated = childHasAudio;
            order.secondOrderDraft = !childHasAudio && !childIsGenerating;
            order.secondOrderGenerating = childIsGenerating;

            if (childHasAudio && (!order.audioUrl && (!order.audioFiles || order.audioFiles.length === 0))) {
              order.productionStatus = related.productionStatus || 'AUDIO_GERADO';
              order.audioUrl = related.audioUrl;
              order.audioFiles = childAudioFiles;
            }

            const isCpfOrGeneric = !order.customerName || order.customerName === 'Cliente' || /^\d[\d.\-\/\s]+$/.test(String(order.customerName).trim());
            if (isCpfOrGeneric && related.customerName && related.customerName !== 'Cliente') {
              order.customerName = related.customerName;
            }
          }
        }
      }
    } catch (relErr) {
      console.warn('[api/orders/[id]] Falha ao buscar pedido vinculado:', relErr?.message);
    }
    })();

    const [audioHistory, isAdmin] = await Promise.all([historicoPromise, adminPromise, vinculadoPromise]);
    order.audioHistory = audioHistory;

    const safeOrder = isAdmin ? order : sanitizeOrderForResponse(order);

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

  const isPaid = order.paymentStatus === 'PAGO' ||
    order.paymentStatus === 'PAGAMENTO_APROVADO' ||
    Boolean(order.isSecondGeneration) ||
    order.paidSku === 'segunda_geracao_bonus' ||
    order.relatedOrder?.paymentStatus === 'PAGO' ||
    order.relatedOrder?.paymentStatus === 'PAGAMENTO_APROVADO';
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
