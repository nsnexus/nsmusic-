import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Grava qual das faixas geradas aparece na página pública de presente (/homenagem?orderId=...) —
// pedido do dono do estúdio em 25/09/2026: quem monta a homenagem escolhe a versão, em vez de
// empilhar as duas para o homenageado decidir. Mesma ideia do que já existia para a Carta
// (api/carta/choose-music).
//
// `orderId` vindo do cliente é uma alegação, não permissão (.claude/rules/security.md): só aceita
// uma URL que realmente pertence a este pedido, e só num pedido pago. Sem escolha salva, a página
// continua mostrando as duas versões, como sempre fez.
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
    const pago = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
    if (!pago) {
      return NextResponse.json({ error: 'Este pedido ainda não está pago' }, { status: 403 });
    }

    const faixasValidas = [order.audioUrl, ...(Array.isArray(order.audioFiles) ? order.audioFiles : [])].filter(Boolean);
    if (!faixasValidas.includes(audioUrl)) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    await updateDoc(orderRef, { homenagemMusicaUrl: audioUrl, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[homenagem/choose-music] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a música escolhida' }, { status: 500 });
  }
}
