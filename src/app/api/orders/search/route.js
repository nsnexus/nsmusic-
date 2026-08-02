import { NextResponse } from 'next/server';
import { collection, getDocs, query, where, limit, orderBy } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function GET(req) {
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

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const orderId = searchParams.get('orderId') || '';

    // Busca suno_tasks por orderId — critério exato, então usa where em vez de varrer tudo (ver M-03).
    if (orderId) {
      const tasksRef = collection(db, 'suno_tasks');
      const tasksSnap = await getDocs(query(tasksRef, where('orderId', '==', orderId), limit(20)));
      const tasks = [];
      tasksSnap.forEach(docSnap => {
        const data = docSnap.data();
        tasks.push({
          taskId: docSnap.id,
          orderId: data.orderId,
          status: data.status,
          updatedAt: data.updatedAt,
          result: data.result ? 'HAS_DATA' : null
        });
      });
      return NextResponse.json({ tasks, count: tasks.length });
    }

    if (!search) {
      return NextResponse.json({ error: 'Parâmetro search ou orderId é obrigatório' }, { status: 400 });
    }

    // Busca por substring em customerName/honoreeName/orderNumber não é possível com `where` do
    // Firestore (não há operador "contains" combinando múltiplos campos) — um índice de busca de
    // texto de verdade (Algolia/Typesense) resolveria isso, mas é uma mudança de infraestrutura fora
    // do escopo deste lote. Como mitigação parcial de custo (M-03), a varredura fica limitada aos
    // pedidos mais recentes em vez de ler a coleção inteira sempre que alguém pesquisa.
    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(query(ordersRef, orderBy('createdAt', 'desc'), limit(300)));

    const results = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.deletedAt) return; // exclusão lógica (M-07) — não aparece na busca do admin

      const name = (data.customerName || '').toLowerCase();
      const honoree = (data.honoreeName || '').toLowerCase();
      const orderNum = (data.orderNumber || '').toLowerCase();

      if (name.includes(search) || honoree.includes(search) || orderNum.includes(search)) {
        results.push({
          id: docSnap.id,
          orderNumber: data.orderNumber,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          honoreeName: data.honoreeName,
          paymentStatus: data.paymentStatus,
          productionStatus: data.productionStatus,
          audioUrl: data.audioUrl || null,
          audioFiles: data.audioFiles || [],
          sunoTaskId: data.sunoTaskId || null,
          createdAt: data.createdAt
        });
      }
    });

    return NextResponse.json({ results, count: results.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
