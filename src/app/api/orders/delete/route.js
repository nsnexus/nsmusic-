import { NextResponse } from 'next/server';
import { doc, updateDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// M-07 no AUDIT_REPORT.md: exclusão de pedido agora é lógica (deletedAt) em vez de apagar o
// documento, e remove as suno_tasks relacionadas (que antes ficavam órfãs para sempre).
async function softDeleteOrder(id, deletedAtIso) {
  await updateDoc(doc(db, 'orders', id), { deletedAt: deletedAtIso, updatedAt: deletedAtIso });

  const tasksRef = collection(db, 'suno_tasks');
  const tasksSnap = await getDocs(query(tasksRef, where('orderId', '==', id))).catch(() => null);
  if (tasksSnap) {
    for (const taskDoc of tasksSnap.docs) {
      await deleteDoc(doc(db, 'suno_tasks', taskDoc.id)).catch((e) =>
        console.warn(`[API /orders/delete] Erro ao remover suno_task órfã ${taskDoc.id}:`, e.message)
      );
    }
  }
}

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

    const deletedAtIso = new Date().toISOString();
    let deletedCount = 0;
    for (const id of targets) {
      try {
        await softDeleteOrder(id, deletedAtIso);
        deletedCount++;
      } catch (err) {
        console.warn(`[API /orders/delete] Erro ao excluir pedido ${id}:`, err.message);
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
