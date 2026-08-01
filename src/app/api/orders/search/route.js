import { NextResponse } from 'next/server';
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const orderId = searchParams.get('orderId') || '';

    // Busca suno_tasks por orderId
    if (orderId) {
      const tasksRef = collection(db, 'suno_tasks');
      const tasksSnap = await getDocs(tasksRef);
      const tasks = [];
      tasksSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.orderId === orderId) {
          tasks.push({
            taskId: docSnap.id,
            orderId: data.orderId,
            status: data.status,
            updatedAt: data.updatedAt,
            result: data.result ? 'HAS_DATA' : null
          });
        }
      });
      return NextResponse.json({ tasks, count: tasks.length });
    }

    if (!search) {
      return NextResponse.json({ error: 'Parâmetro search ou orderId é obrigatório' }, { status: 400 });
    }

    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(ordersRef);

    const results = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
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
