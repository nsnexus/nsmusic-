import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { getPriceForSku } from '@/lib/pricing';
import { createStripeCheckoutSession } from '@/lib/stripe';
import { createInfinitePayCheckoutLink } from '@/lib/infinitepay';
import { isUSOrder } from '@/lib/country';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';

const IMPACTO_MAX_AMOUNT = 1000;

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();
    const { orderId, sku: rawSku, isSecondaryPayment, amount: rawAmount, successUrl, cancelUrl, forceProvider } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const sku = rawSku || (isSecondaryPayment ? 'video_addon' : 'audio_only');

    let amount;
    if (sku === 'impacto') {
      const floor = getPriceForSku('audio_only');
      const requested = Number(rawAmount);
      if (!Number.isFinite(requested)) {
        amount = floor;
      } else if (requested < floor) {
        return NextResponse.json({ error: `O valor mínimo é R$ ${floor.toFixed(2)}.` }, { status: 400 });
      } else if (requested > IMPACTO_MAX_AMOUNT) {
        return NextResponse.json({ error: `Valor muito alto. Máximo R$ ${IMPACTO_MAX_AMOUNT.toFixed(2)}.` }, { status: 400 });
      } else {
        amount = Math.round(requested * 100) / 100;
      }
    } else {
      amount = getPriceForSku(sku);
      if (amount === null) {
        return NextResponse.json({ error: `SKU de produto inválido: ${sku}` }, { status: 400 });
      }
    }

    const existingOrderData = await getOrder(orderId, env);
    if (!existingOrderData) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const isInternational = isUSOrder(existingOrderData);
    let checkoutSession = null;
    let provider = 'infinitepay';
    let infErrorMsg = null;

    // 1. Para pedidos nacionais: tenta InfinitePay como método principal de cartão
    if (!isInternational && forceProvider !== 'stripe') {
      try {
        const infLink = await createInfinitePayCheckoutLink({
          orderId: existingOrderData.id,
          sku,
          amount,
          customerEmail: existingOrderData.customerEmail,
          customerPhone: existingOrderData.customerPhone,
          customerName: existingOrderData.customerName,
          redirectUrl: successUrl,
          cancelUrl,
        }, env);

        checkoutSession = {
          id: `inf_${infLink.slug}`,
          url: infLink.url,
          provider: 'infinitepay',
          slug: infLink.slug,
        };
      } catch (infErr) {
        infErrorMsg = infErr.message;
        console.warn('[card/create] Falha na InfinitePay, acionando fallback Stripe:', infErr.message);
      }
    }

    // 2. Fallback para Stripe: se for internacional ou se a InfinitePay falhou
    if (!checkoutSession) {
      provider = 'stripe';
      const session = await createStripeCheckoutSession({
        orderId: existingOrderData.id,
        sku,
        amount,
        customerEmail: existingOrderData.customerEmail,
        customerPhone: existingOrderData.customerPhone,
        customerName: existingOrderData.customerName,
        successUrl,
        cancelUrl,
      }, env);

      checkoutSession = {
        id: session.id,
        url: session.url,
        provider: 'stripe',
      };
    }

    // Registra o intent no Supabase
    try {
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        await supabase.rpc('record_order_payment_intent', {
          p_order_id: existingOrderData.id,
          p_txid: checkoutSession.id,
          p_sku: sku,
          p_amount: amount,
        });
      }
    } catch (dbErr) {
      console.warn('[card/create] Aviso ao registrar intent no Supabase:', dbErr?.message);
    }

    // Atualiza o pedido com carimbos e o intent atual
    const agora = new Date().toISOString();
    await updateOrder(existingOrderData.id, {
      stripeSessionId: provider === 'stripe' ? checkoutSession.id : null,
      paymentIntentId: checkoutSession.id,
      paymentIntentSku: sku,
      stripeCheckoutAt: agora,
      paymentStatus: existingOrderData.paymentStatus === 'PAGO' || existingOrderData.paymentStatus === 'PAGAMENTO_APROVADO'
        ? existingOrderData.paymentStatus
        : 'AGUARDANDO_PAGAMENTO',
    }, env).catch((e) => {
      console.warn('[card/create] Aviso ao carimbar pedido:', e?.message);
    });

    return NextResponse.json({
      provider,
      sessionId: checkoutSession.id,
      checkoutUrl: checkoutSession.url,
      sku,
      amount,
      ...(provider === 'stripe' && infErrorMsg ? { fallbackReason: infErrorMsg } : {}),
    });
  } catch (error) {
    console.error('[card/create] Erro geral:', error);
    return NextResponse.json(
      { error: error?.message || 'Erro ao iniciar pagamento com cartão.' },
      { status: 500 }
    );
  }
}
