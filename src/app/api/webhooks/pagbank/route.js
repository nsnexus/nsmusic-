import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { applyPaymentApproval } from '@/lib/payments';
import { getPagBankChargeStatus } from '@/lib/pagbank';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();

    // Validar payload
    if (!body || !body.reference_id || !body.id) {
      console.warn('[Webhook PagBank] Payload inválido (sem reference_id/id).');
      // Sempre 200 — mesma convenção do webhook da Efí, evita retentativa infinita.
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const orderId = body.reference_id;
    const txid = body.id;

    // Nunca aprovar a partir do que o corpo do webhook alega (payments.md: "Aprovar um pedido sem
    // ter consultado a API do provedor de pagamento nesta mesma requisição" é proibido) — a versão
    // anterior confiava direto em body.charges[0].status, que qualquer POST externo podia forjar
    // pra liberar um pedido de graça. Reconsulta sempre na API do PagBank, mesmo padrão do webhook
    // da Efí (getChargeStatus).
    let charge;
    try {
      charge = await getPagBankChargeStatus(txid, env);
    } catch (err) {
      console.warn('[Webhook PagBank] Erro ao confirmar cobrança na PagBank:', err.message);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    if (charge?.status !== 'PAID') {
      return NextResponse.json({ success: true }, { status: 200 });
    }

    await applyPaymentApproval(orderId, txid, {
      status: 'approved',
      transaction_amount: charge.amount,
    }, env);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Webhook PagBank] Erro geral:', error.message);
    // Sempre 200 — nunca gerar retentativa infinita do provedor.
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
