import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Grava qual das faixas geradas toca automaticamente quando alguém abre a página pública da Carta
// (/carta?orderId=...) — pedido 04/09/2026: "carta com a música que a pessoa determinar pra tocar
// automático". Só aceita uma URL que realmente pertence ao pedido (orderId é uma alegação do
// cliente, não permissão — ver .claude/rules/security.md); sem escolha salva, a página cai na
// faixa 0 por padrão.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const audioUrl = String(body?.audioUrl || '').trim();
    if (!orderId || !audioUrl) {
      return NextResponse.json({ error: 'orderId e audioUrl são obrigatórios' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const order = snap.data();
    if (!order.hasCartaAccess && !order.cartaAddonPaid) {
      return NextResponse.json({ error: 'Este pedido não tem a Carta paga' }, { status: 403 });
    }

    const faixasValidas = [order.audioUrl, ...(Array.isArray(order.audioFiles) ? order.audioFiles : [])].filter(Boolean);
    if (!faixasValidas.includes(audioUrl)) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    await updateDoc(orderRef, { cartaMusicaUrl: audioUrl, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[carta/choose-music] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a música escolhida' }, { status: 500 });
  }
}
