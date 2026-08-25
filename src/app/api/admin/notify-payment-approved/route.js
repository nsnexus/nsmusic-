import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { notifyPaymentApproved } from '@/lib/payments';

export const runtime = 'edge';

// Reenvio manual da mensagem "pagamento aprovado" — para pedidos aprovados manualmente no painel
// admin (updateDoc direto do browser em admin/pedidos/[id]/page.jsx, que não passa por
// applyPaymentApproval e por isso nunca dispara o WhatsApp automático).
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

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const orderData = snap.data();
    if (orderData.paymentStatus !== 'PAGAMENTO_APROVADO' && orderData.paymentStatus !== 'PAGO') {
      return NextResponse.json({ error: 'Pedido ainda não está com pagamento aprovado.' }, { status: 400 });
    }

    await notifyPaymentApproved(orderRef, orderData, { force: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/admin/notify-payment-approved] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao notificar cliente.' }, { status: 500 });
  }
}
