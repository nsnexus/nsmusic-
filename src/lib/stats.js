// Consolidação de métricas de pedidos.
// Histórico consolidado gravado na tabela `config` do Supabase.
import { getSupabaseEdge } from './supabase-edge.js';

function isPaid(order) {
  return order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO';
}

function hasAudio(order) {
  return Boolean(order?.audioUrl || (Array.isArray(order?.audioFiles) && order.audioFiles.length > 0));
}

/**
 * Converte o createdAt do pedido (string ISO, Timestamp ou epoch) na chave AAAA-MM-DD.
 */
export function statsDayKey(createdAt) {
  if (!createdAt) return '';
  try {
    let iso = '';
    if (typeof createdAt?.toDate === 'function') iso = createdAt.toDate().toISOString();
    else if (typeof createdAt === 'string') iso = createdAt;
    else if (typeof createdAt === 'number') iso = new Date(createdAt).toISOString();
    return iso ? iso.slice(0, 10) : '';
  } catch (e) {
    return '';
  }
}

/**
 * Monta os incrementos de um único pedido.
 */
export function buildOrderMetrics(order) {
  const paid = isPaid(order);
  const videoPaid = Boolean(order?.videoAddonPaid || order?.hasVideoAccess);
  const playbackPaid = Boolean(order?.playbackAddonPaid || order?.hasPlaybackAccess);

  const musicRevenue = paid ? (Number(order?.expectedAmount) || 0) : 0;

  return {
    ordersCreated: 1,
    musicsGenerated: hasAudio(order) ? 1 : 0,
    musicsPaid: paid ? 1 : 0,
    videosPaid: videoPaid ? 1 : 0,
    playbacksPaid: playbackPaid ? 1 : 0,
    revenue: musicRevenue,
  };
}

/**
 * Soma as métricas de vários pedidos numa única escrita por dia no Supabase.
 */
export async function consolidateOrders(orders, env = {}) {
  if (!Array.isArray(orders) || orders.length === 0) {
    return { days: 0, consolidated: 0 };
  }

  const byDay = new Map();
  const totals = { ordersCreated: 0, musicsGenerated: 0, musicsPaid: 0, videosPaid: 0, playbacksPaid: 0, revenue: 0 };

  for (const order of orders) {
    const day = statsDayKey(order?.createdAt) || 'sem-data';
    const metrics = buildOrderMetrics(order);

    const acc = byDay.get(day) || { ordersCreated: 0, musicsGenerated: 0, musicsPaid: 0, videosPaid: 0, playbacksPaid: 0, revenue: 0 };
    for (const key of Object.keys(metrics)) {
      acc[key] += metrics[key];
      totals[key] += metrics[key];
    }
    byDay.set(day, acc);
  }

  const nowIso = new Date().toISOString();
  let consolidated = 0;

  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return { days: byDay.size, consolidated: orders.length };
    }

    for (const [day, metrics] of byDay.entries()) {
      const chave = `config_stats_${day}`;
      const { data } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
      const existing = data?.valor || {};
      const merged = { date: day, updatedAt: nowIso };
      for (const k of Object.keys(metrics)) {
        merged[k] = (existing[k] || 0) + (k === 'revenue' ? Math.round(metrics[k] * 100) / 100 : metrics[k]);
      }
      await supabase.from('config').upsert({
        chave,
        valor: merged,
        updated_at: nowIso
      });
      consolidated += metrics.ordersCreated;
    }

    const { data: totalData } = await supabase.from('config').select('valor').eq('chave', 'config_stats_totals').maybeSingle();
    const existingTotals = totalData?.valor || {};
    const mergedTotals = { updatedAt: nowIso };
    for (const k of Object.keys(totals)) {
      mergedTotals[k] = (existingTotals[k] || 0) + (k === 'revenue' ? Math.round(totals[k] * 100) / 100 : totals[k]);
    }
    await supabase.from('config').upsert({
      chave: 'config_stats_totals',
      valor: mergedTotals,
      updated_at: nowIso
    });

    return { days: byDay.size, consolidated };
  } catch (err) {
    console.error('[stats] Falha ao consolidar métricas:', err.message);
    return { days: 0, consolidated, error: err.message };
  }
}
