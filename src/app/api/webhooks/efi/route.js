import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { applyPaymentApproval } from '@/lib/payments';
import { applyGatewayPaymentApproval } from '@/lib/gateway';
import { getChargeStatus } from '@/lib/efi';

export const runtime = 'edge';

function isValidSecret(req, env) {
  const expected = String(env?.EFI_WEBHOOK_SECRET || process.env.EFI_WEBHOOK_SECRET || '').trim();
  if (!expected) return true;
  const { searchParams } = new URL(req.url);
  return searchParams.get('secret') === expected;
}

async function findOrderIdByTxid(txid, env = {}) {
  try {
    const { getSupabaseEdge } = await import('@/lib/supabase-edge');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data, error } = await supabase
        .from('orders')
        .select('id')
        .eq('extras->>paymentIntentId', txid)
        .limit(1);

      if (!error && Array.isArray(data) && data.length > 0) {
        return data[0].id;
      }

      const { data: dataOld } = await supabase
        .from('orders')
        .select('id')
        .contains('extras->previousPaymentIntentIds', JSON.stringify([txid]))
        .limit(1);

      if (dataOld && dataOld.length > 0) {
        return dataOld[0].id;
      }
    }
  } catch (sbErr) {
    console.warn('[Webhook Efí] Erro ao buscar pedido no Supabase por txid:', sbErr.message);
  }
  return null;
}

async function processPixItem(item, env) {
  const txid = item?.txid;
  if (!txid) return;

  let charge;
  try {
    charge = await getChargeStatus(txid, env);
  } catch (err) {
    console.warn('[Webhook Efí] Erro ao confirmar cobrança na Efí:', err.message);
    return;
  }

  if (!charge || charge.status !== 'CONCLUIDA') return;

  const transactionAmount = Number(charge.valor?.original);
  const orderId = await findOrderIdByTxid(txid, env);

  if (orderId) {
    await applyPaymentApproval(orderId, txid, { status: 'approved', transaction_amount: transactionAmount }, env);
    return;
  }

  const gatewayResult = await applyGatewayPaymentApproval(txid, { status: 'approved', transaction_amount: transactionAmount }, env);
  if (gatewayResult?.applied) {
    console.log(`[Webhook Efí] Pagamento de gateway (${gatewayResult.chargeData?.appId}) aprovado com sucesso para txid: ${txid}`);
    return;
  }

  console.warn('[Webhook Efí] Nenhum pedido ou cobrança de gateway encontrado para o txid recebido:', txid);
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    if (!isValidSecret(req, env)) {
      console.warn('[Webhook Efí] Segredo da URL inválido, ignorando notificação.');
      return NextResponse.json({ success: true }, { status: 200 });
    }

    let body = {};
    try {
      body = await req.json();
    } catch (e) {}

    const items = Array.isArray(body?.pix) ? body.pix : [];
    for (const item of items) {
      await processPixItem(item, env);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Erro no processamento do Webhook Efí:', error.message);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
