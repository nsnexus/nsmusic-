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

export function markPreviewListened(orderId) {
  if (!orderId || jaMarcadoNestaVisita.has(orderId)) return;
  jaMarcadoNestaVisita.add(orderId);
  updateDoc(doc(db, 'orders', orderId), {
    previewListenedAt: new Date().toISOString(),
  }).catch((e) => console.warn('[previewTracking] Falha ao marcar prévia ouvida:', e?.message));
}
