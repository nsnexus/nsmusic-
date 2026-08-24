import { NextResponse } from 'next/server';
import { collection, query, where, limit, getDocs, doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// TODO(debug-temp): rota provisória pra diagnosticar por que uma notificação de WhatsApp não
// chegou. Busca por orderNumber ou pelos últimos dígitos do telefone, nunca ecoa telefone/e-mail
// (ver .claude/rules/security.md). Remover depois de checado.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get('orderNumber');
    const orderId = searchParams.get('orderId') || searchParams.get('id');
    const phoneLast4 = searchParams.get('phoneLast4');

    if (!orderNumber && !orderId && !phoneLast4) {
      return NextResponse.json({ error: 'Informe orderNumber, orderId ou phoneLast4.' }, { status: 400 });
    }

    const ordersRef = collection(db, 'orders');
    let snap;
    let found = null;

    if (orderId) {
      const docSnap = await getDoc(doc(db, 'orders', orderId));
      if (docSnap.exists()) {
        found = { id: docSnap.id, data: docSnap.data() };
      }
    } else if (orderNumber) {
      snap = await getDocs(query(ordersRef, where('orderNumber', '==', orderNumber), limit(1)));
    } else {
      // Sem índice em customerPhone terminando em X — varre só os mais recentes via createdAt seria
      // ideal, mas sem orderBy+where combinado sem índice composto; aceitável pra debug pontual.
      snap = await getDocs(query(ordersRef, limit(500)));
    }

    let found = null;
    snap.forEach((d) => {
      const data = d.data();
      if (orderNumber) {
        found = { id: d.id, data };
      } else if (String(data.customerPhone || '').endsWith(phoneLast4)) {
        found = { id: d.id, data };
      }
    });

    if (!found) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const { customerPhone, customerEmail, customerName, honoreeName, ...safe } = found.data;

    return NextResponse.json({
      id: found.id,
      hasPhone: Boolean(customerPhone),
      ...safe,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
