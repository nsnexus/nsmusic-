import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Marca no pedido que o cliente copiou o código Pix (pedido 20/09/2026). É o sinal de intenção de
// pagamento mais forte que temos: quem copia o código tem risco real de pagar e o pagamento não ser
// computado se o webhook falhar E o cliente fechar a aba antes do polling confirmar — foi
// exatamente o perfil dos 4 pagamentos presos encontrados em 20/09 (R$ 53,94, um deles parado
// há 34h).
//
// Serve pra duas coisas:
//   1. Varredura de segurança (src/app/api/orders/reconcile) priorizar quem copiou e não pagou;
//   2. Admin distinguir "copiou o Pix e sumiu" de "nem chegou a copiar" (desistiu antes).
//
// Não decide nada de pagamento — só carimba intenção. A aprovação continua exigindo consulta à Efí
// (ver .claude/rules/payments.md).
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const agora = new Date().toISOString();
    const dados = snap.data();
    await updateDoc(orderRef, {
      // Primeira cópia é a que interessa pra medir intenção; a última ajuda a saber se ele voltou.
      ...(dados.pixCopiedAt ? {} : { pixCopiedAt: agora }),
      pixCopiedLastAt: agora,
      updatedAt: agora,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[payments/pix-copied] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
