import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { applyPaymentApproval } from '@/lib/payments';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();
    console.log('[Webhook PagBank] Payload recebido:', JSON.stringify(body));

    // Validar payload
    if (!body || !body.reference_id) {
      return NextResponse.json({ error: 'Payload inválido (sem reference_id).' }, { status: 400 });
    }

    const orderId = body.reference_id;
    let isPaid = false;
    let transactionAmount = 0;
    
    // O webhook pode vir com um array de charges.
    if (body.charges && body.charges.length > 0) {
      const charge = body.charges[0];
      if (charge.status === 'PAID') {
        isPaid = true;
        transactionAmount = charge.amount && charge.amount.value ? (charge.amount.value / 100) : 0;
      }
    }

    if (isPaid) {
      // O txid no nosso banco é o ID do pedido no PagBank (body.id)
      const txid = body.id;
      
      console.log(`[Webhook PagBank] Pagamento aprovado para pedido ${orderId} (TXID: ${txid})`);
      
      await applyPaymentApproval(orderId, txid, { 
        status: 'approved', 
        transaction_amount: transactionAmount 
      });
      
      return NextResponse.json({ success: true, message: 'Pedido aprovado.' }, { status: 200 });
    } else {
      console.log(`[Webhook PagBank] Notificação ignorada (status não é PAID) para pedido ${orderId}`);
      return NextResponse.json({ success: true, message: 'Notificação recebida, mas não requer aprovação.' }, { status: 200 });
    }

  } catch (error) {
    console.error("[Webhook PagBank] Erro geral:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
