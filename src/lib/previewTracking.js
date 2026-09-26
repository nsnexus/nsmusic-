'use client';

// Achado 09/09/2026, pedido do dono do estúdio: saber se o cliente realmente ouviu a prévia ajuda a
// separar "não gostou do resultado" de "nunca conseguiu carregar o áudio".
//
// Guarda em memória pra não disparar chamada a cada play/pause/replay dentro da mesma visita.
const jaMarcadoNestaVisita = new Set();

export const PREVIEW_TRACKING_ENABLED_AFTER = new Date('2026-09-09T13:30:00.000Z').getTime();

export function hasPreviewTrackingData(order) {
  if (!order?.createdAt) return false;
  return new Date(order.createdAt).getTime() >= PREVIEW_TRACKING_ENABLED_AFTER;
}

export function markPreviewListened(orderId) {
  if (!orderId || jaMarcadoNestaVisita.has(orderId)) return;
  jaMarcadoNestaVisita.add(orderId);
  const nowIso = new Date().toISOString();

  try {
    fetch('/api/orders/client-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, previewListenedAt: nowIso }),
    }).catch((e) => console.warn('[previewTracking] Falha ao marcar prévia ouvida:', e?.message));
  } catch {}
}
