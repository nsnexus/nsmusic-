import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { applyPaymentApproval } from '@/lib/payments';
import { verifyStripeWebhookSignature, retrieveStripeCheckoutSession, getStripeConfig } from '@/lib/stripe';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const { webhookSecret, secretKey } = getStripeConfig(env);

  let rawBody;
  try {
    rawBody = await req.text();
  } catch (err) {
    console.error('[stripe-webhook] Falha ao ler corpo da requisição:', err?.message);
    return NextResponse.json({ error: 'Falha ao ler corpo da requisição.' }, { status: 400 });
  }

  const sigHeader = req.headers.get('stripe-signature') || '';

  // 1. Verificação criptográfica de assinatura obrigatória (fail-closed - S07)
  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET não configurado — webhook rejeitado.');
    return NextResponse.json({ error: 'Configuração do webhook ausente.' }, { status: 503 });
  }

  const isSignatureValid = await verifyStripeWebhookSignature(rawBody, sigHeader, webhookSecret);
  if (!isSignatureValid) {
    console.warn('[stripe-webhook] Assinatura do webhook Stripe INVÁLIDA rejeitada.');
    return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    console.error('[stripe-webhook] Falha ao fazer parse do JSON:', err?.message);
    return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
  }

  const eventType = event.type;
  console.log(`[stripe-webhook] Evento recebido: ${eventType} (ID: ${event.id})`);

  try {
    if (eventType === 'checkout.session.completed') {
      const session = event.data?.object;
      if (!session) {
        return NextResponse.json({ received: true });
      }

      const sessionId = session.id;
      const orderId = session.client_reference_id || session.metadata?.orderId;
      const sku = session.metadata?.sku;
      const transactionAmount = (session.amount_total || 0) / 100;

      if (!orderId) {
        console.warn(`[stripe-webhook] Sessão ${sessionId} recebida sem orderId associado.`);
        return NextResponse.json({ received: true });
      }

      // 2. Re-consulta direta à API da Stripe para garantia absoluta de autenticidade (S07)
      let confirmedSession = null;
      if (secretKey) {
        try {
          confirmedSession = await retrieveStripeCheckoutSession(sessionId, env);
        } catch (apiErr) {
          console.warn(`[stripe-webhook] Falha ao reconsultar sessão ${sessionId} na Stripe:`, apiErr?.message);
        }
      }

      if (!confirmedSession || confirmedSession.payment_status !== 'paid') {
        console.warn(`[stripe-webhook] Sessão ${sessionId} não confirmada como paga na API da Stripe.`);
        return NextResponse.json({ received: true });
      }

      const confirmedOrderId = confirmedSession.client_reference_id || confirmedSession.metadata?.orderId;
      if (!confirmedOrderId || confirmedOrderId !== orderId) {
        console.warn(`[stripe-webhook] Discrepância de orderId na sessão ${sessionId}. Esperado: ${orderId}, retornado: ${confirmedOrderId}`);
        return NextResponse.json({ received: true });
      }

      const finalAmount = (confirmedSession.amount_total || 0) / 100;
      console.log(`[stripe-webhook] Aprovando pedido ${orderId} via Stripe (${sessionId}) - R$ ${finalAmount}`);
      const result = await applyPaymentApproval(
        orderId,
        sessionId,
        {
          status: 'approved',
          transaction_amount: finalAmount,
          method: 'stripe',
          gateway: 'stripe',
          sku: sku || confirmedSession.metadata?.sku,
        },
        env
      );
      console.log(`[stripe-webhook] Resultado applyPaymentApproval:`, result?.applied, result?.reason || 'ok');
    } else if (eventType === 'payment_intent.succeeded') {
      console.log(`[stripe-webhook] payment_intent.succeeded recebido para ${event.data?.object?.id}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error('[stripe-webhook] Erro ao processar evento:', err);
    // Sempre retornar 200 para evitar retentativas infinitas se for erro interno de processamento
    return NextResponse.json({ received: true, error: err?.message }, { status: 200 });
  }
}
