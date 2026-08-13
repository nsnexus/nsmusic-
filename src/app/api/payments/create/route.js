import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { getPriceForSku } from '@/lib/pricing';
import { generateStaticPixPayload } from '@/lib/pixStatic';
import { createPixCharge } from '@/lib/efi';
import { createPagBankPixCharge } from '@/lib/pagbank';

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
    let provider = 'static';
    // TODO(debug-temp): remover _debugFallback assim que a causa do fallback for confirmada —
    // ver .claude/rules/security.md (mensagem de erro de serviço externo não deve chegar ao cliente).
    const debugFallback = {};

    const existingOrderData = orderSnap.data();
    const customerName = existingOrderData.customerName || 'Cliente';
    const customerEmail = existingOrderData.customerEmail || 'contato@nsnexus.com.br';

    try {
      // 1. Prioridade 1: Efí (Pix puro, sem exigência de CPF)
      charge = await createPixCharge({ orderId, amount, description: `Pedido NS Music ${orderId}` }, env);
      provider = 'efi';
    } catch (errEfi) {
      console.warn('[api/payments/create] Efí falhou, tentando PagBank:', errEfi.message);
      debugFallback.efi = errEfi.message;

      try {
        // 2. Prioridade 2: PagBank (Usa CNPJ fixo)
        charge = await createPagBankPixCharge(orderId, amount, customerName, customerEmail, env);
        provider = 'pagbank';
      } catch (errPagBank) {
        console.warn('[api/payments/create] PagBank falhou, caindo para PIX Estático:', errPagBank.message);
        debugFallback.pagbank = errPagBank.message;

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
      provider: provider,
      _debugFallback: debugFallback
    });

  } catch (error) {
    console.error("Erro ao criar cobrança Pix:", error.message);
    return NextResponse.json({ error: 'Falha ao criar cobrança Pix.' }, { status: 500 });
  }
}
