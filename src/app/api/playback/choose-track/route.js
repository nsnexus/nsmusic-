import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Grava qual das 2 faixas geradas o cliente quer usar no add-on de Playback — achado 04/09/2026: a
// separação vocal da Kie.ai pode falhar pra uma faixa específica (`kie_callback_200` sem
// `instrumental_url`) mesmo com a música em si tocando normal; antes o sistema sempre tentava a
// faixa 0, sem alternativa. Chamado ANTES do pagamento (o card mostra um preview de cada faixa pro
// cliente ouvir e escolher) — não libera nada, só guarda a preferência pra quando o pagamento aprovar.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const audioId = String(body?.audioId || '').trim();
    if (!orderId || !audioId) {
      return NextResponse.json({ error: 'orderId e audioId são obrigatórios' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const order = snap.data();
    // audioId precisa ser uma das faixas REALMENTE geradas para este pedido — nunca aceitar um valor
    // arbitrário do cliente aqui (orderId é uma alegação, ver .claude/rules/security.md).
    if (!Array.isArray(order.audioIds) || !order.audioIds.includes(audioId)) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    await updateDoc(orderRef, { playbackChosenAudioId: audioId, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[playback/choose-track] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a faixa escolhida' }, { status: 500 });
  }
}
