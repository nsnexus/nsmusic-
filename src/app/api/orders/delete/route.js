import { NextResponse } from 'next/server';
import { doc, deleteDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await req.json();
    const targets = body.orderIds || (body.orderId ? [body.orderId] : []);

    if (!targets || targets.length === 0) {
      return NextResponse.json({ error: 'Nenhum ID de pedido fornecido para exclusão.' }, { status: 400 });
    }

    let deletedCount = 0;
    for (const id of targets) {
      try {
        await deleteDoc(doc(db, 'orders', id));
        deletedCount++;
      } catch (err) {
        console.warn(`[API /orders/delete] Erro ao deletar doc ${id}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      deletedCount
    }, { status: 200 });

  } catch (error) {
    console.error("Erro na API /api/orders/delete:", error);
    return NextResponse.json({ error: error.message || 'Erro ao excluir pedidos' }, { status: 500 });
  }
}
