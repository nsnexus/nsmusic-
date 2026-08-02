import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';
// AVISO IMPORTANTE: Não importar @/lib/firebase ou firebase/firestore aqui, pois quebram o Edge Runtime

export const runtime = 'edge';

// Segredo na própria URL do webhook (mesmo padrão do webhook do Kie.ai) — a Efí não assina o corpo
// da notificação, então essa é a primeira barreira. A segunda e mais importante é nunca confiar no
// valor recebido: sempre reconsultar a cobrança na API da Efí antes de aprovar (ver processPixItem).
function isValidSecret(req, env) {
  const expected = String(env?.EFI_WEBHOOK_SECRET || process.env.EFI_WEBHOOK_SECRET || '').trim();
  if (!expected) return true; // ainda não configurado em produção — ver docs/EFI_SETUP.md
  const { searchParams } = new URL(req.url);
  return searchParams.get('secret') === expected;
}

async function findOrderIdByTxid(txid) {
  try {
    const ordersRef = collection(dbEdge, 'orders');
    const q = query(ordersRef, where('paymentIntentId', '==', txid), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return snap.docs[0].id;
  } catch (err) {
    console.warn('[Webhook Efí] Erro ao buscar pedido pelo txid:', err.message);
    return null;
  }
}

async function processPixItem(item, env) {
  const txid = item?.txid;
  if (!txid) return;

  // Nunca aprova a partir do valor enviado no corpo do webhook — reconsulta a cobrança na Efí.
  let charge;
  try {
    charge = await getChargeStatus(txid, env);
  } catch (err) {
    console.warn('[Webhook Efí] Erro ao confirmar cobrança na Efí:', err.message);
    return;
  }

  if (!charge || charge.status !== 'CONCLUIDA') return;

  const orderId = await findOrderIdByTxid(txid);
  if (!orderId) {
    console.warn('[Webhook Efí] Nenhum pedido encontrado para o txid recebido.');
    return;
  }

  const transactionAmount = Number(charge.valor?.original);
  await applyPaymentApproval(orderId, txid, { status: 'approved', transaction_amount: transactionAmount });
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

    // Webhook sempre responde 200, mesmo em erro de processamento, para não gerar retentativa
    // infinita da Efí (mesma convenção usada nos outros webhooks do projeto).
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Erro no processamento do Webhook Efí:', error.message);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
