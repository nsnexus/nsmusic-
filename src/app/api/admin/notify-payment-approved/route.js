import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { requireAdmin } from '@/lib/auth';
import { notifyPaymentApproved } from '@/lib/payments';

export const runtime = 'edge';

// Reenvio manual da mensagem "pagamento aprovado"
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

    const orderData = await getOrder(orderId, env);
    if (!orderData) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    if (orderData.paymentStatus !== 'PAGAMENTO_APROVADO' && orderData.paymentStatus !== 'PAGO') {
      return NextResponse.json({ error: 'Pedido ainda não está com pagamento aprovado.' }, { status: 400 });
    }

    await notifyPaymentApproved(orderId, orderData, { force: true }, env);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[api/admin/notify-payment-approved] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao notificar cliente.' }, { status: 500 });
  }
}
