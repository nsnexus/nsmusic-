import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';
import { applyPaymentApproval } from '@/lib/payments';
// AVISO IMPORTANTE: Não importar @/lib/firebase ou firebase/firestore aqui, pois quebram o Edge Runtime

export const runtime = 'edge';

function getEnvVar(name) {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.[name]) return String(ctx.env[name]).trim();
  } catch (e) {}
  return String(process.env[name] || '').trim();
}

// Valida o header x-signature do Mercado Pago (HMAC-SHA256), conforme
// https://www.mercadopago.com.br/developers/pt/docs/checkout-api/webhooks — ver A-01 no
// AUDIT_REPORT.md. Se MERCADO_PAGO_WEBHOOK_SECRET não estiver configurado, a validação é pulada
// (a reconsulta à API do MP continua sendo a segunda barreira) até o segredo ser configurado em
// produção — não desative essa checagem manualmente uma vez que o segredo exista.
async function verifyMercadoPagoSignature(req, dataId) {
  const secret = getEnvVar('MERCADO_PAGO_WEBHOOK_SECRET');
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const signatureHeader = req.headers.get('x-signature') || '';
  const requestId = req.headers.get('x-request-id') || '';

  if (!signatureHeader) {
    return { ok: false, reason: 'missing_signature' };
  }

  const parts = {};
  signatureHeader.split(',').forEach((chunk) => {
    const [key, value] = chunk.split('=');
    if (key && value !== undefined) parts[key.trim()] = value.trim();
  });

  if (!parts.ts || !parts.v1) {
    return { ok: false, reason: 'malformed_signature' };
  }

  const manifest = `id:${dataId};request-id:${requestId};ts:${parts.ts};`;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(manifest));
    const computedHex = Array.from(new Uint8Array(sigBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return { ok: computedHex === parts.v1, reason: computedHex === parts.v1 ? null : 'signature_mismatch' };
  } catch (err) {
    console.error('[Webhook MP] Erro ao validar assinatura:', err.message);
    return { ok: false, reason: 'verification_error' };
  }
}

async function resolvePaymentAndOrder(rawPaymentId) {
  const numericMatch = String(rawPaymentId).match(/\d+/);
  const paymentId = numericMatch ? numericMatch[0] : String(rawPaymentId).replace(/\D/g, '');
  if (!paymentId) return null;

  const accessToken = getEnvVar('MERCADO_PAGO_ACCESS_TOKEN');
  if (!accessToken) {
    console.error('[Webhook MP] Token do Mercado Pago não configurado.');
    return null;
  }

  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!mpRes.ok) {
    console.warn(`[Webhook MP] Erro ao consultar pagamento ${paymentId} no Mercado Pago:`, mpRes.status);
    return null;
  }

  const paymentData = await mpRes.json();
  let finalStatus = paymentData.status;
  let finalPaymentId = paymentId;
  let finalMpData = paymentData;
  let orderId = paymentData.external_reference || null;

  console.log(`[Webhook MP] PaymentID: ${paymentId}, Status: ${finalStatus}, OrderID: ${orderId}`);

  // Fallback: busca por external_reference caso o pagamento específico ainda não esteja aprovado.
  if (finalStatus !== 'approved' && orderId) {
    try {
      const searchRes = await fetch(
        `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const approvedPayment = (searchData.results || []).find((p) => p.status === 'approved');
        if (approvedPayment) {
          finalStatus = 'approved';
          finalPaymentId = String(approvedPayment.id);
          finalMpData = approvedPayment;
        }
      }
    } catch (e) {
      console.warn('[Webhook MP] Erro no fallback de busca:', e.message);
    }
  }

  // Sem external_reference no pagamento: tenta achar o pedido que já registrou este paymentId.
  if (!orderId) {
    try {
      const ordersRef = collection(dbEdge, 'orders');
      const q = query(ordersRef, where('paymentId', '==', String(finalPaymentId)));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) orderId = querySnap.docs[0].id;
    } catch (e) {
      console.warn('[Webhook MP] Erro ao buscar pedido por paymentId:', e.message);
    }
  }

  if (!orderId) return null;

  return { orderId, paymentId: finalPaymentId, mpPayment: finalMpData };
}

async function processPayment(rawPaymentId, req) {
  if (!rawPaymentId) return false;

  const sigResult = await verifyMercadoPagoSignature(req, rawPaymentId);
  if (!sigResult.ok) {
    console.warn('[Webhook MP] Assinatura inválida, ignorando notificação:', sigResult.reason);
    return { rejected: true, reason: sigResult.reason };
  }

  const resolved = await resolvePaymentAndOrder(rawPaymentId);
  if (!resolved) return false;

  const result = await applyPaymentApproval(resolved.orderId, resolved.paymentId, resolved.mpPayment);
  return result.applied;
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    let body = {};
    try {
      body = await req.json();
    } catch (e) {}

    let paymentId = body?.data?.id || body?.id || searchParams.get('data.id') || searchParams.get('id');

    if (!paymentId && body?.resource) {
      const parts = body.resource.split('/');
      paymentId = parts[parts.length - 1];
    }

    let rejected = false;
    if (paymentId) {
      const result = await processPayment(paymentId, req);
      rejected = result && result.rejected;
    }

    // Assinatura inválida: única situação em que respondemos diferente de 200, para deixar claro que
    // a notificação foi recusada (ver A-01/teste no FIX_PLAN.md). Qualquer outro erro de
    // processamento responde 200 para não gerar retentativa infinita do Mercado Pago.
    if (rejected) {
      return NextResponse.json({ error: 'Assinatura inválida.' }, { status: 401 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Erro no processamento do Webhook Mercado Pago (POST):", error);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const topic = searchParams.get('topic') || searchParams.get('type');
    const paymentId = searchParams.get('id') || searchParams.get('data.id');

    console.log("[Webhook MP GET] Notificação recebida:", { topic, hasPaymentId: !!paymentId });

    if (paymentId) {
      await processPayment(paymentId, req);
    }

    return NextResponse.json({ status: 'ok', message: 'Webhook Mercado Pago ativo' });
  } catch (error) {
    console.error("Erro no Webhook Mercado Pago (GET):", error);
    return NextResponse.json({ status: 'ok' });
  }
}
