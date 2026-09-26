import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { getPriceForSku } from '@/lib/pricing';
import { extractReceiptData, isValidE2eIdFormat } from '@/lib/receiptVerification';
import { applyPaymentApproval } from '@/lib/payments';

export const runtime = 'edge';

const MAX_FILE_BASE64_CHARS = 8_000_000;

function isAlreadyApproved(order) {
  return order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
}

async function findOrderIdByPaymentId(paymentId, env = {}) {
  try {
    const { getSupabaseEdge } = await import('@/lib/supabase-edge');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data } = await supabase.from('orders')
        .select('id')
        .or(`extras->>paymentId.eq.${paymentId},extras->>videoPaymentId.eq.${paymentId}`)
        .limit(1)
        .maybeSingle();
      if (data?.id) return data.id;
    }
  } catch (err) {
    console.warn('[verify-receipt] Falha ao buscar pedido por paymentId:', err.message);
  }
  return null;
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json();
    const { orderId, sku: rawSku, imageBase64, mimeType } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json({ error: 'Arquivo do comprovante é obrigatório.' }, { status: 400 });
    }
    if (imageBase64.length > MAX_FILE_BASE64_CHARS) {
      return NextResponse.json({ error: 'Arquivo muito grande.' }, { status: 400 });
    }
    const isImage = mimeType && String(mimeType).startsWith('image/');
    const isPdf = mimeType === 'application/pdf';
    if (!isImage && !isPdf) {
      return NextResponse.json({ error: 'Tipo de arquivo inválido — envie uma imagem ou PDF.' }, { status: 400 });
    }

    const sku = rawSku || 'audio_only';
    const expectedAmount = getPriceForSku(sku);
    if (expectedAmount === null) {
      return NextResponse.json({ error: `SKU de produto inválido: ${sku}` }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Idempotência: já aprovado (por qualquer via)
    if (isAlreadyApproved(order)) {
      return NextResponse.json({ approved: true, reason: 'already_approved' });
    }

    let extracted;
    try {
      extracted = await extractReceiptData(imageBase64, mimeType, env);
    } catch (err) {
      console.warn('[verify-receipt] Falha ao extrair dados do comprovante:', err.message);
      return NextResponse.json({ approved: false, reason: 'extraction_failed' });
    }

    if (!isValidE2eIdFormat(extracted.e2eId)) {
      return NextResponse.json({ approved: false, reason: 'invalid_receipt' });
    }

    if (typeof extracted.valor !== 'number' || Math.abs(extracted.valor - expectedAmount) >= 0.01) {
      return NextResponse.json({ approved: false, reason: 'amount_mismatch' });
    }

    const existingOrderId = await findOrderIdByPaymentId(extracted.e2eId, env);
    if (existingOrderId && existingOrderId !== orderId) {
      console.warn('[verify-receipt] ID de transação já usado em outro pedido, bloqueado.');
      return NextResponse.json({ approved: false, reason: 'duplicate_receipt' });
    }

    const result = await applyPaymentApproval(orderId, extracted.e2eId, {
      status: 'approved',
      transaction_amount: extracted.valor,
    }, env);

    if (result.applied) {
      return NextResponse.json({ approved: true });
    }
    if (result.reason === 'already_processed') {
      return NextResponse.json({ approved: true, reason: 'already_processed' });
    }

    console.warn('[verify-receipt] applyPaymentApproval não aplicou:', result.reason);
    return NextResponse.json({ approved: false, reason: 'approval_failed' });
  } catch (error) {
    console.error('[verify-receipt] Erro inesperado:', error.message);
    return NextResponse.json({ approved: false, reason: 'internal_error' }, { status: 500 });
  }
}
