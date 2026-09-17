import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { CARTA_TEMA_SLOTS } from '@/lib/cartaModelo';

export const runtime = 'edge';

// Grava o tema visual que o cliente escolheu pra carta (pedido 17/09/2026: "cliente poder alterar o
// tema da cartinha") — por padrão o tema é decidido sozinho por ocasião+relação (ver
// src/lib/cartaModelo.js:cartaTemaId), mas o cliente pode trocar por qualquer um dos 7 configurados
// no painel admin. Só aceita um `temaId` que exista de fato em CARTA_TEMA_SLOTS — orderId é uma
// alegação do cliente, não permissão (ver .claude/rules/security.md).
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const temaId = String(body?.temaId || '').trim();
    if (!orderId || !temaId) {
      return NextResponse.json({ error: 'orderId e temaId são obrigatórios' }, { status: 400 });
    }
    if (!CARTA_TEMA_SLOTS.some((s) => s.id === temaId)) {
      return NextResponse.json({ error: 'Tema inválido' }, { status: 400 });
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

    await updateDoc(orderRef, { cartaTemaEscolhido: temaId, updatedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[carta/choose-theme] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar o tema escolhido' }, { status: 500 });
  }
}
