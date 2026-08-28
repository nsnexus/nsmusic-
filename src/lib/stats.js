// Consolidação de métricas de pedidos na coleção `stats`.
//
// Por que existe: os pedidos são apagados depois de 10 dias (ver api/orders/cleanup) para não
// acumular custo de Firestore e de Storage. Antes de apagar, os números que interessam ao negócio
// (quantas músicas foram geradas, quantas foram pagas, quantos vídeos e playbacks vendidos, quanto
// entrou) são somados aqui — o histórico de FATURAMENTO sobrevive mesmo sem o pedido em si.
//
// Formato: um documento por dia (`stats/2026-08-28`, a data de CRIAÇÃO do pedido) mais um documento
// acumulado (`stats/_totals`). Documento por dia permite montar gráfico de evolução depois; o
// acumulado dá o total de sempre sem precisar varrer a coleção.
//
// Idempotência: todo incremento usa `increment()` do Firestore (atômico, não precisa ler antes). O
// chamador é responsável por marcar o pedido como já consolidado antes de apagá-lo, para que uma
// falha na exclusão não faça o mesmo pedido ser contado de novo na execução seguinte — ver
// `statsConsolidated` em api/orders/cleanup.

import { doc, setDoc, increment } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';

// Mesma convenção do resto do sistema: PAGAMENTO_APROVADO e PAGO são equivalentes (ver CLAUDE.md).
function isPaid(order) {
  return order?.paymentStatus === 'PAGAMENTO_APROVADO' || order?.paymentStatus === 'PAGO';
}

function hasAudio(order) {
  return Boolean(order?.audioUrl || (Array.isArray(order?.audioFiles) && order.audioFiles.length > 0));
}

/**
 * Converte o createdAt do pedido (string ISO, Timestamp do Firestore ou epoch) na chave AAAA-MM-DD
 * do documento diário. Retorna '' quando não dá para determinar a data.
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
 * Monta os incrementos de um único pedido. Exportada separadamente para poder ser testada sem
 * Firestore e para permitir agregar vários pedidos numa escrita só.
 */
export function buildOrderMetrics(order) {
  const paid = isPaid(order);
  const videoPaid = Boolean(order?.videoAddonPaid || order?.hasVideoAccess);
  const playbackPaid = Boolean(order?.playbackAddonPaid || order?.hasPlaybackAccess);

  // O valor cobrado vem do que foi de fato registrado na cobrança (expectedAmount, gravado por
  // api/payments/create a partir do catálogo do servidor) — nunca de um campo enviado pelo cliente.
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
 * Soma as métricas de vários pedidos numa única escrita por dia (e uma no acumulado) — importante
 * porque a limpeza processa dezenas de pedidos por execução e uma escrita por pedido multiplicaria
 * o custo justamente na rotina feita para economizar.
 *
 * @param {Array<object>} orders pedidos a consolidar (cada um precisa de createdAt)
 * @returns {Promise<{days: number, consolidated: number, error?: string}>}
 */
export async function consolidateOrders(orders) {
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
    for (const [day, metrics] of byDay.entries()) {
      const updates = { date: day, updatedAt: nowIso };
      for (const key of Object.keys(metrics)) {
        // Arredonda a receita para 2 casas: soma de floats acumula erro (9.99 + 9.99 + ...).
        updates[key] = key === 'revenue' ? increment(Math.round(metrics[key] * 100) / 100) : increment(metrics[key]);
      }
      await setDoc(doc(db, 'stats', day), updates, { merge: true });
      consolidated += metrics.ordersCreated;
    }

    const totalUpdates = { updatedAt: nowIso };
    for (const key of Object.keys(totals)) {
      totalUpdates[key] = key === 'revenue' ? increment(Math.round(totals[key] * 100) / 100) : increment(totals[key]);
    }
    await setDoc(doc(db, 'stats', '_totals'), totalUpdates, { merge: true });

    return { days: byDay.size, consolidated };
  } catch (err) {
    console.error('[stats] Falha ao consolidar métricas:', err.message);
    return { days: 0, consolidated, error: err.message };
  }
}
