import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { getPriceForSku } from '@/lib/pricing';
import { generateStaticPixPayload } from '@/lib/pixStatic';
import { createPixCharge } from '@/lib/efi';

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

    let charge;
    let provider = 'static';

    try {
      charge = await createPixCharge({ orderId, amount, description: `Pedido NS Music ${orderId}` }, env);
      provider = 'efi';
    } catch (errEfi) {
      console.warn('[api/payments/create] Efí falhou, caindo para PIX Estático:', errEfi.message);
      charge = generateStaticPixPayload(amount, orderId);
      provider = 'static';
    }

    try {
      const prevIds = Array.isArray(existingOrderData.previousPaymentIntentIds)
        ? [...existingOrderData.previousPaymentIntentIds]
        : [];
      if (existingOrderData.paymentIntentId && existingOrderData.paymentIntentId !== charge.txid) {
        if (!prevIds.includes(existingOrderData.paymentIntentId)) {
          prevIds.push(existingOrderData.paymentIntentId);
        }
      }

      const skuByTxid = { ...(existingOrderData.paymentIntentSkuByTxid || {}), [charge.txid]: sku };
      const amountByTxid = { ...(existingOrderData.paymentIntentAmountByTxid || {}), [charge.txid]: amount };

      const agora = new Date().toISOString();
      const updates = {
        paymentIntentId: charge.txid,
        paymentIntentSku: sku,
        expectedAmount: amount,
        paymentIntentSkuByTxid: skuByTxid,
        paymentIntentAmountByTxid: amountByTxid,
        previousPaymentIntentIds: prevIds,
        updatedAt: agora,
      };

      await updateOrder(orderId, updates, env);
    } catch (err) {
      console.error('[api/payments/create] Falha ao persistir paymentIntent no pedido:', err.message);
      return NextResponse.json({ error: 'Falha ao registrar a intenção de pagamento. Tente novamente.' }, { status: 500 });
    }

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
