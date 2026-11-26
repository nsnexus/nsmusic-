import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getStripeConfig, valorDoCartao, criarPaymentIntentCartao } from '@/lib/stripe';
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
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
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
    const pedido = await getOrder(orderId, env);
    if (!pedido) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    // Pedido dos EUA continua no checkout hospedado de sempre (o cliente cai nele por onFalhaAoAbrir).
    if (isUSOrder(pedido)) return NextResponse.json({ error: 'Pedido internacional usa o checkout hospedado.' }, { status: 409 });

    const pi = await criarPaymentIntentCartao({
      orderId: pedido.id,
      sku,
      valor: preco.valor,
      customerEmail: pedido.customerEmail,
      descricao: NOMES[sku] || 'Música Personalizada - NS Music',
    }, env);

    // Registra o intent (SKU por txid) para applyPaymentApproval saber o que liberar.
    try {
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        await supabase.rpc('record_order_payment_intent', { p_order_id: pedido.id, p_txid: pi.id, p_sku: sku, p_amount: preco.valor });
      }
    } catch (dbErr) {
      console.warn('[cartao/intent] Aviso ao registrar o intent:', dbErr?.message);
    }

    const jaPago = pedido.paymentStatus === 'PAGO' || pedido.paymentStatus === 'PAGAMENTO_APROVADO';
    await updateOrder(pedido.id, {
      paymentIntentId: pi.id,
      paymentIntentSku: sku,
      stripeCheckoutAt: new Date().toISOString(),
      ...(jaPago ? {} : { paymentStatus: 'AGUARDANDO_PAGAMENTO' }),
    }, env).catch((e) => console.warn('[cartao/intent] Aviso ao carimbar o pedido:', e?.message));

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
