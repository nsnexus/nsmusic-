import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { applyPaymentApproval } from '@/lib/payments';
import { checkInfinitePayPayment } from '@/lib/infinitepay';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  let body = {};
  try {
    body = await req.json();
  } catch (parseErr) {
    console.warn('[webhook/infinitepay] Payload inválido recebido:', parseErr.message);
    return NextResponse.json({ ok: true, error: 'invalid_json' });
  }

  try {
    const orderNsu = body.order_nsu || body.orderId || body.order_id || body.metadata?.orderId;
    const slug = body.invoice_slug || body.slug || body.invoiceSlug;
    const transactionNsu = body.transaction_nsu || body.transactionId || body.id;
    const rawPaidCents = Number(body.paid_amount ?? body.amount) || 0;
    const paidAmount = rawPaidCents > 0 ? rawPaidCents / 100 : 0;
    const captureMethod = body.capture_method || 'credit_card';

    if (!orderNsu && !slug) {
      console.warn('[webhook/infinitepay] Notificação sem order_nsu e sem slug:', body);
      return NextResponse.json({ ok: true, skipped: 'missing_identifiers' });
    }

    // Busca o pedido no banco por ID, orderNumber ou slug
    let order = orderNsu ? await findOrderByIdOrNumber(orderNsu, env) : null;

    if (!order && slug) {
      try {
        const { getSupabaseEdge } = await import('@/lib/supabase-edge');
        const supabase = getSupabaseEdge(env);
        if (supabase) {
          // Tenta achar por intent em order_payment_intents
          const { data: intentRow } = await supabase
            .from('order_payment_intents')
            .select('order_id')
            .or(`txid.eq.inf_${slug},txid.eq.${slug}`)
            .limit(1)
            .maybeSingle();

          if (intentRow?.order_id) {
            order = await findOrderByIdOrNumber(intentRow.order_id, env);
          }
        }
      } catch (e) {
        console.warn('[webhook/infinitepay] Erro na busca por slug:', e.message);
      }
    }

    if (!order) {
      console.warn(`[webhook/infinitepay] Pedido não encontrado para order_nsu='${orderNsu}', slug='${slug}':`, body);
      return NextResponse.json({ ok: true, skipped: 'order_not_found' });
    }

    // Validação ativa no endpoint /payment_check da InfinitePay (garante que não é spoofing)
    let paymentVerified = false;
    let verifiedAmount = paidAmount;
    let verifiedMethod = captureMethod;

    try {
      // 1. Tenta checagem com order.id
      let checkRes = await checkInfinitePayPayment({
        orderNsu: order.id,
        slug,
        transactionNsu,
      }, env);

      // 2. Se não confirmou, tenta checagem com order.orderNumber
      if (!checkRes.paid && order.orderNumber) {
        const checkRes2 = await checkInfinitePayPayment({
          orderNsu: order.orderNumber,
          slug,
          transactionNsu,
        }, env);
        if (checkRes2.paid) checkRes = checkRes2;
      }

      // 3. Se ainda não confirmou e orderNsu original foi diferente de ambos, tenta com ele
      if (!checkRes.paid && orderNsu && orderNsu !== order.id && orderNsu !== order.orderNumber) {
        const checkRes3 = await checkInfinitePayPayment({
          orderNsu,
          slug,
          transactionNsu,
        }, env);
        if (checkRes3.paid) checkRes = checkRes3;
      }

      if (checkRes.paid) {
        paymentVerified = true;
        if (checkRes.paidAmount > 0) verifiedAmount = checkRes.paidAmount;
        if (checkRes.captureMethod) verifiedMethod = checkRes.captureMethod;
      }
    } catch (checkErr) {
      console.warn('[webhook/infinitepay] Falha ao consultar /payment_check:', checkErr.message);
      // Se a consulta falhou por rede, mas o webhook tem dados completos e confirmação de pagamento:
      if ((body.paid === true || body.success === true || paidAmount > 0) && slug) {
        paymentVerified = true;
      }
    }

    if (paymentVerified) {
      const paymentId = transactionNsu || slug || `inf_${order.id}`;
      const approvalResult = await applyPaymentApproval(
        order.id,
        paymentId,
        {
          status: 'approved',
          transaction_amount: verifiedAmount,
          method: verifiedMethod,
          gateway: 'infinitepay',
        },
        env
      );

      console.log(`[webhook/infinitepay] Pagamento aprovado para pedido ${order.id}:`, approvalResult);
      return NextResponse.json({ ok: true, applied: approvalResult.applied });
    }

    return NextResponse.json({ ok: true, status: 'unverified' });
  } catch (err) {
    console.error('[webhook/infinitepay] Erro ao processar webhook:', err.message);
    // Retorna 200 para evitar que o gateway continue retentando em loop infinito
    return NextResponse.json({ ok: true, error: err.message });
  }
}

