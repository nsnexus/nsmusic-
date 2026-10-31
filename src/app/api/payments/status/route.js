import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';

export const runtime = 'edge';

function jsonNoCache(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');
    const orderId = searchParams.get('orderId');

    // ── 1. Verificação rápida no Banco (Supabase como primário, Firestore como fallback) ──
    let orderData = null;
    if (orderId) {
      try {
        orderData = await findOrderByIdOrNumber(orderId, env);
        if (orderData) {
          // Atalho só é seguro quando o paymentId consultado é EXATAMENTE o que já foi
          // verificado e aprovado antes (guardado em paymentId/videoPaymentId por
          // applyPaymentApproval). Um pedido já aprovado (paymentStatus) não significa que
          // QUALQUER OUTRO paymentId consultado nele também esteja pago — isso permitia liberar
          // o add-on de vídeo (cobrança nova, nunca verificada) de graça em qualquer pedido cuja
          // música já tivesse sido paga antes. Qualquer paymentId que não bater aqui cai no fluxo
          // normal abaixo, que sempre reconsulta a Efí antes de aprovar.
          //
          // Checagem extra de defesa em profundidade: além do ID bater, exige paymentStatus
          // realmente aprovado no banco. O campo paymentId só deveria existir em orderData depois
          // de applyPaymentApproval gravá-lo — mas se algum ponto do frontend voltar a gravá-lo
          // antes da hora (bug da aprovação falsa, achado da auditoria de fechamento 2026-08-02),
          const cleanQueryPaymentId = String(paymentId || '').trim().toUpperCase();
          const cleanSavedPaymentId = String(orderData.paymentId || '').trim().toUpperCase();
          const cleanVideoPaymentId = String(orderData.videoPaymentId || '').trim().toUpperCase();
          const isMainSongApproved = orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO';

          if (
            cleanQueryPaymentId && cleanSavedPaymentId && cleanQueryPaymentId === cleanSavedPaymentId &&
            isMainSongApproved
          ) {
            return jsonNoCache({ status: "approved" });
          }
          if (
            !paymentId &&
            isMainSongApproved
          ) {
            return jsonNoCache({ status: "approved" });
          }
          if (cleanQueryPaymentId && cleanVideoPaymentId && cleanQueryPaymentId === cleanVideoPaymentId &&
              (orderData.hasVideoAccess || orderData.videoAddonPaid)) {
            return jsonNoCache({ status: "approved" });
          }
        }
      } catch (quickCheckErr) {
        console.warn("[PaymentStatus] Erro na verificação rápida no DB:", quickCheckErr.message);
      }
    }

    // txid da cobrança Efí ou ID da sessão Stripe (cs_...)
    const txid = paymentId || orderData?.paymentIntentId;
    if (!txid) {
      return jsonNoCache({ status: "pending", error: "Missing parameters" }, 400);
    }

    // Verificação de cobrança via Stripe Checkout (sessões começam com cs_)
    if (String(txid).startsWith('cs_')) {
      try {
        const { retrieveStripeCheckoutSession } = await import('@/lib/stripe');
        const session = await retrieveStripeCheckoutSession(txid, env);
        if (session && session.payment_status === 'paid' && orderId) {
          const sessionOrderId = session.client_reference_id || session.metadata?.orderId;
          if (!sessionOrderId || (sessionOrderId !== orderId && sessionOrderId !== orderData?.id && sessionOrderId !== orderData?.orderNumber)) {
            console.warn(`[PaymentStatus] Sessão Stripe ${session.id} pertence a '${sessionOrderId}', rejeitada para pedido '${orderId}'.`);
            return jsonNoCache({ status: "pending", error: "session_mismatch" });
          }
          const transactionAmount = (session.amount_total || 0) / 100;
          await applyPaymentApproval(orderId, session.id, {
            status: 'approved',
            transaction_amount: transactionAmount,
            method: 'stripe',
            gateway: 'stripe',
          }, env);
          return jsonNoCache({ status: "approved" });
        }
        return jsonNoCache({ status: "pending" });
      } catch (err) {
        console.warn("[PaymentStatus] Erro ao consultar sessão Stripe:", err?.message);
        return jsonNoCache({ status: "pending" });
      }
    }

    // Verificação de cobrança via InfinitePay Checkout (IDs começam com inf_ ou parâmetro slug)
    if (String(txid).startsWith('inf_') || searchParams.get('slug')) {
      try {
        const slug = searchParams.get('slug') || String(txid).replace(/^inf_/, '');
        const transactionNsu = searchParams.get('transaction_nsu') || null;
        const { checkInfinitePayPayment } = await import('@/lib/infinitepay');
        const checkRes = await checkInfinitePayPayment({
          orderNsu: orderId || orderData?.id,
          slug,
          transactionNsu,
        }, env);

        if (checkRes.paid && orderId) {
          const transactionAmount = checkRes.paidAmount || (orderData?.expectedAmount || 0);
          await applyPaymentApproval(orderId, txid, {
            status: 'approved',
            transaction_amount: transactionAmount,
            method: checkRes.captureMethod || 'credit_card',
            gateway: 'infinitepay',
          }, env);
          return jsonNoCache({ status: "approved" });
        }
        return jsonNoCache({ status: "pending" });
      } catch (err) {
        console.warn("[PaymentStatus] Erro ao consultar InfinitePay:", err?.message);
        return jsonNoCache({ status: "pending" });
      }
    }

    let charge;
    let providerFound = null;
    try {
      charge = await getChargeStatus(txid, env);
      if (charge) providerFound = 'efi';
    } catch (err) {
      // Consulta no PagBank existia aqui como segunda tentativa, removida em 18/09/2026 junto com o
      // resto da integração: PAGBANK_TOKEN nunca foi configurado em produção, então essa chamada
      // sempre falhava e o fluxo caía neste mesmo "pending" — só que alguns segundos depois.
      // Cobrança que não é da Efí é a estática (sem status consultável), confirmada por comprovante.
      console.warn("[PaymentStatus] Erro ao consultar a Efí:", err.message);
      return jsonNoCache({ status: "pending" });
    }

    // O txid consultado precisa ser realmente uma cobrança gerada PARA ESTE pedido — nunca aprovar
    // com base num txid de outro pedido (ex: um paymentId antigo, já pago, reaproveitado contra um
    // orderId qualquer). Sem esta checagem, qualquer txid CONCLUIDA na Efí aprovava o orderId
    // informado, mesmo sem relação nenhuma entre os dois (auditoria de fechamento, 2026-08-02).
    // Também aceita um txid de uma cobrança anterior do MESMO pedido, já substituída por uma mais
    // nova (ver previousPaymentIntentIds em api/payments/create) — evita perder um pagamento
    // legítimo de uma cobrança antiga que o cliente pagou por engano (achado #4).
    const currentIntent = orderData?.paymentIntentId || orderData?.extras?.paymentIntentId;
    const previousTxids = Array.isArray(orderData?.previousPaymentIntentIds || orderData?.extras?.previousPaymentIntentIds)
      ? (orderData.previousPaymentIntentIds || orderData.extras?.previousPaymentIntentIds)
      : [];

    const orderIdPrefix = String(orderData?.id || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 15);
    const matchesPrefix = orderIdPrefix.length >= 6 && String(txid).toUpperCase().startsWith(orderIdPrefix);

    const matchesSolicitacao = !!charge?.solicitacaoPagador && (
      charge.solicitacaoPagador.includes(String(orderData?.id || '')) ||
      (orderData?.orderNumber && charge.solicitacaoPagador.includes(String(orderData.orderNumber)))
    );

    const cleanTxidUpper = String(txid || '').trim().toUpperCase();
    const cleanCurrentIntentUpper = String(currentIntent || '').trim().toUpperCase();

    // Também confere se existe registro formal na tabela order_payment_intents
    let belongsViaIntentsTable = false;
    try {
      const { getSupabaseEdge } = await import('@/lib/supabase-edge');
      const supabase = getSupabaseEdge(env);
      if (supabase && orderData?.id) {
        const { data: intentRow } = await supabase
          .from('order_payment_intents')
          .select('id')
          .eq('order_id', orderData.id)
          .ilike('txid', String(txid).trim())
          .limit(1)
          .maybeSingle();
        if (intentRow?.id) {
          belongsViaIntentsTable = true;
        }
      }
    } catch (e) {}

    const txidBelongsToOrder = !!orderData && (
      (cleanCurrentIntentUpper && cleanTxidUpper === cleanCurrentIntentUpper) ||
      previousTxids.some((id) => String(id).trim().toUpperCase() === cleanTxidUpper) ||
      matchesPrefix ||
      matchesSolicitacao ||
      belongsViaIntentsTable
    );

    if (charge?.status === 'CONCLUIDA' && orderId && txidBelongsToOrder) {
      const transactionAmount = Number(charge.valor?.original);
      await applyPaymentApproval(orderId, txid, { status: 'approved', transaction_amount: transactionAmount }, env);
      return jsonNoCache({ status: "approved" });
    }
    if (charge?.status === 'CONCLUIDA' && orderId && !txidBelongsToOrder) {
      console.warn('[PaymentStatus] txid consultado não corresponde ao paymentIntentId do pedido; ignorando aprovação.');
    }

    return jsonNoCache({ status: "pending" });

  } catch (error) {
    console.error("[PaymentStatus] Erro geral:", error.message);
    return jsonNoCache({ status: "pending", error: error.message });
  }
}
