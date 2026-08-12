import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { getPriceForSku } from '@/lib/pricing';
import { createPixCharge, getPixQrCodeImage } from '@/lib/efi';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();
    const { orderId, sku: rawSku, isSecondaryPayment } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    // Compatibilidade: enquanto todos os pontos de chamada não enviarem `sku` explícito,
    // deriva do flag legado isSecondaryPayment (video_addon vs audio_only).
    const sku = rawSku || (isSecondaryPayment ? 'video_addon' : 'audio_only');

    // O valor NUNCA vem do corpo da requisição — só do catálogo do servidor (ver C-05 no AUDIT_REPORT.md).
    const amount = getPriceForSku(sku);
    if (amount === null) {
      return NextResponse.json({ error: `SKU de produto inválido: ${sku}` }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    let charge;
    try {
      charge = await createPixCharge({ orderId, amount, description: `Pedido NS Music ${orderId}` }, env);
    } catch (err) {
      console.error('[api/payments/create] Falha ao criar cobrança Pix na Efí:', err.message);
      return NextResponse.json({ error: 'Falha ao gerar a cobrança Pix. Tente novamente.' }, { status: 502 });
    }

    // Persiste a intenção de cobrança no pedido: é o que a aprovação (webhook/status) usa depois para
    // saber o que foi realmente cobrado, em vez de inferir pelo valor da transação (ver A-13).
    try {
      const existingOrderData = orderSnap.data();
      const updates = {
        paymentIntentId: charge.txid,
        paymentIntentSku: sku,
        expectedAmount: amount,
        updatedAt: new Date().toISOString(),
      };
      // paymentIntentId é sobrescrito a cada nova cobrança (ex: cliente troca de pacote antes de
      // pagar, ou compra o add-on de vídeo depois). Sem preservar o txid anterior em algum lugar, o
      // webhook dessa cobrança antiga não encontra mais o pedido se ela acabar sendo paga (ver
      // achado #4 da auditoria de fechamento, 2026-08-02) — o pagamento ficaria "perdido".
      if (existingOrderData.paymentIntentId && existingOrderData.paymentIntentId !== charge.txid) {
        updates.previousPaymentIntentIds = arrayUnion(existingOrderData.paymentIntentId);
      }
      await updateDoc(orderRef, updates);
    } catch (err) {
      console.error('[api/payments/create] Falha ao persistir paymentIntent no pedido:', err.message);
      return NextResponse.json({ error: 'Falha ao registrar a intenção de pagamento. Tente novamente.' }, { status: 500 });
    }

    // Imagem do QR Code: parte dos clientes não localiza o botão de copiar e desiste do pagamento,
    // então a imagem é exibida como caminho principal na UI. getPixQrCodeImage nunca lança — se a
    // Efí não devolver a imagem, o copia-e-cola continua funcionando e a cobrança segue válida.
    const qrCodeBase64 = await getPixQrCodeImage(charge.locId, env);

    return NextResponse.json({
      paymentId: charge.txid,
      status: 'pending',
      qrCode: charge.pixCopiaECola,
      qrCodeBase64,
      ticketUrl: ''
    });

  } catch (error) {
    console.error("Erro ao criar cobrança Pix:", error.message);
    return NextResponse.json({ error: 'Falha ao criar cobrança Pix.' }, { status: 500 });
  }
}
