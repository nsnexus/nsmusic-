import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getStripeConfig, valorDoCartao, criarPaymentIntentCartao, cancelarPaymentIntent } from '@/lib/stripe';
import { isUSOrder } from '@/lib/country';

export const runtime = 'edge';

// Cartão dentro do site: cria (ou reaproveita) o PaymentIntent da Stripe e devolve o client_secret
// para o Payment Element. O valor vem do catálogo pelo SKU — nunca do corpo da requisição (exceto o
// 'impacto', com piso e teto). A aprovação acontece em /api/payments/status e /api/webhooks/stripe,
// sempre reconsultando o PaymentIntent na Stripe.

const NOMES = {
  audio_only: 'Músicas Personalizadas com IA - NS Music',
  combo: 'Músicas + Vídeo Homenagem - NS Music',
  video_addon: 'Vídeo Homenagem (Slideshow) - NS Music',
};

export async function POST(req) {
  let env = {};
  let emSegundoPlano = (p) => p.catch(() => {});
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
    if (ctx?.ctx?.waitUntil) emSegundoPlano = (p) => ctx.ctx.waitUntil(p.catch(() => {}));
  } catch { /* fora da Cloudflare */ }

  const { secretKey, publishableKey } = getStripeConfig(env);
  if (!secretKey || !publishableKey) {
    return NextResponse.json({ error: 'Pagamento com cartão indisponível (STRIPE_SECRET_KEY / NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).' }, { status: 503 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const orderId = String(body?.orderId || '');
  const sku = String(body?.sku || 'audio_only');
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(orderId)) return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });

  const preco = valorDoCartao(sku, body?.amount);
  if (preco.erro) return NextResponse.json({ error: preco.erro }, { status: 400 });

  try {
    // Leitura do pedido e criação da cobrança EM PARALELO: o banco às vezes leva segundos
    // (medido em 27/11/2026: 1,7–8 s por leitura). Pedido inexistente ou dos EUA cancela a cobrança.
    const [pedido, pi] = await Promise.all([
      getOrder(orderId, env),
      criarPaymentIntentCartao({ orderId, sku, valor: preco.valor, descricao: NOMES[sku] || 'Música Personalizada - NS Music' }, env),
    ]);
    if (!pedido || isUSOrder(pedido)) {
      if (pi?.status !== 'succeeded') emSegundoPlano(cancelarPaymentIntent(pi.id, env));
      return pedido
        ? NextResponse.json({ error: 'Pedido internacional usa o checkout hospedado.' }, { status: 409 })
        : NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Gravações que não precisam ser esperadas (a aprovação só acontece depois do pagamento,
    // e reconsulta tudo): intent registrado (SKU por txid) e carimbo no pedido.
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      emSegundoPlano(supabase.rpc('record_order_payment_intent', { p_order_id: pedido.id, p_txid: pi.id, p_sku: sku, p_amount: preco.valor })
        .then((r) => { if (r?.error) console.warn('[cartao/intent] Aviso ao registrar o intent:', r.error.message); }));
    }
    const jaPago = pedido.paymentStatus === 'PAGO' || pedido.paymentStatus === 'PAGAMENTO_APROVADO';
    emSegundoPlano(updateOrder(pedido.id, {
      paymentIntentId: pi.id,
      paymentIntentSku: sku,
      stripeCheckoutAt: new Date().toISOString(),
      ...(jaPago ? {} : { paymentStatus: 'AGUARDANDO_PAGAMENTO' }),
    }, env));

    return NextResponse.json({
      paymentIntentId: pi.id,
      status: pi.status,
      clientSecret: pi.status === 'succeeded' ? null : pi.client_secret,
      publishableKey,
      amount: preco.valor,
      sku,
    });
  } catch (err) {
    console.error('[cartao/intent] Falha ao criar a cobrança no cartão:', err?.code || err?.status || err?.name);
    return NextResponse.json({ error: 'Não foi possível abrir o pagamento com cartão agora.' }, { status: 502 });
  }
}
