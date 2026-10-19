import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { getPriceForSku } from '@/lib/pricing';
import { createPixCharge, getChargeStatus, generateTxid } from '@/lib/efi';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { generateStaticPixPayload } from '@/lib/pixStatic';

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
    const { orderId, sku: rawSku, isSecondaryPayment, amount: rawAmount } = body;

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

    const supabase = getSupabaseEdge(env);
    if (!supabase) return NextResponse.json({ error: 'Pagamento indisponível no momento.' }, { status: 503 });
    const { data: intent, error: reservationError } = await supabase.rpc('reserve_order_payment', {
      p_order_id: existingOrderData.id, p_sku: sku, p_amount: amount,
      p_txid: generateTxid(existingOrderData.id),
    });
    if (reservationError || !intent) return NextResponse.json({ error: 'Não foi possível reservar seu PIX. Tente novamente.' }, { status: 503 });

    let charge = intent.qr_code && intent.provider === 'efi' ? { txid: intent.txid, pixCopiaECola: intent.qr_code } : null;
    let provider = intent.provider || 'efi';
    if (!charge) {
      try {
        const existing = await getChargeStatus(intent.txid, env);
        charge = existing || await createPixCharge({ orderId: existingOrderData.id, amount, description: `Pedido NS Music ${existingOrderData.id}`, txid: intent.txid }, env);
        provider = 'efi';
      } catch (error) {
        // Preserve the existing contingency flow. The stable reservation also identifies
        // the receipt, while an uncertain dynamic charge can still be reconciled.
        charge = generateStaticPixPayload(amount, existingOrderData.id, undefined, intent.txid);
        provider = 'static';
      }
      if (!charge?.pixCopiaECola) return NextResponse.json({ error: 'A cobrança não está disponível. Consulte o pagamento ou tente novamente.' }, { status: 503 });
      const saved = await supabase.from('order_payment_intents').eq('id', intent.id).update({ qr_code: charge.pixCopiaECola, txid: charge.txid, provider });
      if (saved.error) return NextResponse.json({ error: 'Não foi possível registrar o PIX. Tente novamente para recuperar a cobrança.' }, { status: 503 });
    }
    const recorded = await supabase.rpc('record_order_payment_intent', {
      p_order_id: existingOrderData.id, p_txid: charge.txid, p_sku: sku, p_amount: amount,
    });
    if (recorded.error || !recorded.data) return NextResponse.json({ error: 'Não foi possível associar o PIX ao pedido. Tente novamente.' }, { status: 503 });

    return NextResponse.json({
      paymentId: charge.txid,
      status: 'pending',
      qrCode: charge.pixCopiaECola,
      qrCodeBase64: '',
      ticketUrl: '',
      provider: provider
    });

  } catch (error) {
    console.error("Erro ao criar cobrança Pix:", error.message);
    return NextResponse.json({ error: 'Falha ao criar cobrança Pix.' }, { status: 500 });
  }
}
