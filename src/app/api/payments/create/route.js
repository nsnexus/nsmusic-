import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { getPriceForSku } from '@/lib/pricing';
import { generateStaticPixPayload } from '@/lib/pixStatic';
import { createPixCharge } from '@/lib/efi';
import { createPagBankPixCharge } from '@/lib/pagbank';

export const runtime = 'edge';

// Teto de sanidade só pro SKU 'impacto' (preço variável) — nunca regra de negócio, só proteção
// contra erro de digitação (ex: cliente digitando 999999 sem querer).
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

    // Compatibilidade: enquanto todos os pontos de chamada não enviarem `sku` explícito,
    // deriva do flag legado isSecondaryPayment (video_addon vs audio_only).
    const sku = rawSku || (isSecondaryPayment ? 'video_addon' : 'audio_only');

    // O valor NUNCA vem do corpo da requisição — só do catálogo do servidor (ver C-05 no AUDIT_REPORT.md).
    //
    // ÚNICA EXCEÇÃO deliberada: 'impacto' (página /pagar, "pague conforme o impacto emocional",
    // pedido do dono do estúdio 02/09/2026). Preço variável, mas com PISO no preço da música — o
    // cliente nunca consegue mandar um valor abaixo disso, e o teto é só sanidade contra erro de
    // digitação, nunca uma regra de negócio.
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

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    let charge;
    let provider = 'static';

    const existingOrderData = orderSnap.data();
    const customerName = existingOrderData.customerName || 'Cliente';
    const customerEmail = existingOrderData.customerEmail || 'contato@nsnexus.com.br';

    try {
      // 1. Prioridade 1: Efí (Pix puro, sem exigência de CPF)
      charge = await createPixCharge({ orderId, amount, description: `Pedido NS Music ${orderId}` }, env);
      provider = 'efi';
    } catch (errEfi) {
      console.warn('[api/payments/create] Efí falhou, tentando PagBank:', errEfi.message);

      try {
        // 2. Prioridade 2: PagBank (Usa CNPJ fixo)
        charge = await createPagBankPixCharge(orderId, amount, customerName, customerEmail, env);
        provider = 'pagbank';
      } catch (errPagBank) {
        console.warn('[api/payments/create] PagBank falhou, caindo para PIX Estático:', errPagBank.message);

        // 3. Prioridade 3: Fallback Paliativo (Estático manual)
        charge = generateStaticPixPayload(amount, orderId);
        provider = 'static';
      }
    }

    // Persiste a intenção de cobrança no pedido: é o que a aprovação (webhook/status) usa depois para
    // saber o que foi realmente cobrado, em vez de inferir pelo valor da transação (ver A-13).
    try {
      const updates = {
        paymentIntentId: charge.txid,
        paymentIntentSku: sku,
        expectedAmount: amount,
        updatedAt: new Date().toISOString(),
        // Vínculo txid -> SKU, que é o que a aprovação precisa saber (ver C-12 / achado 30/08/2026).
        // paymentIntentSku sozinho guarda apenas a ÚLTIMA cobrança criada: quando a aprovação chega
        // de uma cobrança ANTERIOR (retentativa de webhook, reconciliação por cron, cliente pagando
        // um QR antigo), ela era creditada ao produto errado — o pedido cuja música já tinha sido
        // paga liberava o add-on recém-oferecido sem ninguém pagar por ele.
        [`paymentIntentSkuByTxid.${charge.txid}`]: sku,
        [`paymentIntentAmountByTxid.${charge.txid}`]: amount,
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

    // O QR Code é desenhado no navegador a partir de `qrCode` (o copia-e-cola), em
    // src/components/PixQrCode.jsx. Uma versão anterior buscava a imagem pronta na Efí aqui
    // (GET /v2/loc/:id/qrcode); em produção ela voltava vazia e o cliente ficava sem QR Code, além
    // de custar uma segunda autenticação OAuth e mais um hop pelo Worker de mTLS a cada checkout.
    // O BR Code é a única entrada que um QR Code precisa, então desenhar no cliente não depende de
    // nada disso. `qrCodeBase64` permanece na resposta, vazio, para não quebrar chamador antigo.
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
