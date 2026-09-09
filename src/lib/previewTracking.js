'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

// Achado 09/09/2026, pedido do dono do estúdio: saber se o cliente realmente ouviu a prévia ajuda a
// separar "não gostou do resultado" de "nunca conseguiu carregar o áudio" (ver o bug de
// redirecionamento cego corrigido no mesmo lote, em src/app/criar/page.jsx). Client-only de propósito
// — nunca importar isto numa rota Edge (usa o SDK completo do Firestore, não o /lite).
//
// Guarda em memória (não em Firestore) pra não escrever de novo a cada play/pause/replay dentro da
// mesma visita — não é dado de pagamento, não precisa de runTransaction nem de checar o valor atual
// antes de escrever.
const jaMarcadoNestaVisita = new Set();

// Ativado em 09/09/2026 (deploy do commit que introduziu previewListenedAt) — pedido explícito do
// dono: pedido criado ANTES disso nunca teve a chance de gravar o campo, então mostrar "não ouviu"
// pra ele seria enganoso (o cliente pode muito bem ter ouvido e até pago). Telas do admin devem
// tratar esses pedidos como "sem dado", nunca como "não ouviu".
export const PREVIEW_TRACKING_ENABLED_AFTER = new Date('2026-09-09T13:30:00.000Z').getTime();

export function hasPreviewTrackingData(order) {
  if (!order?.createdAt) return false;
  return new Date(order.createdAt).getTime() >= PREVIEW_TRACKING_ENABLED_AFTER;
}

export function markPreviewListened(orderId) {
  if (!orderId || jaMarcadoNestaVisita.has(orderId)) return;
  jaMarcadoNestaVisita.add(orderId);
  updateDoc(doc(db, 'orders', orderId), {
    previewListenedAt: new Date().toISOString(),
  }).catch((e) => console.warn('[previewTracking] Falha ao marcar prévia ouvida:', e?.message));
}
