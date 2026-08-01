import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';
import { applyPaymentApproval } from '@/lib/payments';

export const runtime = 'edge';

function jsonNoCache(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    }
  });
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    let paymentId = searchParams.get('paymentId');
    let orderId = searchParams.get('orderId');

    // ── 1. Verificação rápida no Firestore ──
    if (orderId) {
      try {
        const orderSnap = await getDoc(doc(dbEdge, 'orders', orderId));
        if (orderSnap.exists()) {
          const orderData = orderSnap.data();

          if (orderData.paymentStatus === 'PAGAMENTO_APROVADO' || orderData.paymentStatus === 'PAGO') {
            if (paymentId && String(paymentId) === String(orderData.videoPaymentId)) {
              if (orderData.hasVideoAccess || orderData.videoAddonPaid) {
                return jsonNoCache({ status: "approved" });
              }
            } else {
              return jsonNoCache({ status: "approved" });
            }
          }
        }
      } catch (quickCheckErr) {
        console.warn("[PaymentStatus] Erro na verificação rápida no DB:", quickCheckErr.message);
      }
    }

    if (!paymentId && !orderId) {
      return jsonNoCache({ status: "pending", error: "Missing parameters" }, 400);
    }

    let mpAccessToken = '';
    try {
      const ctx = getRequestContext();
      if (ctx?.env?.MERCADO_PAGO_ACCESS_TOKEN) mpAccessToken = String(ctx.env.MERCADO_PAGO_ACCESS_TOKEN).trim();
    } catch (e) {}
    if (!mpAccessToken) mpAccessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();

    if (!mpAccessToken) {
      return jsonNoCache({ status: "pending" });
    }

    const numericMatch = String(paymentId || '').match(/\d+/);
    const cleanMpPaymentId = numericMatch ? numericMatch[0] : String(paymentId || '').trim();

    let mpData = null;
    try {
      if (cleanMpPaymentId) {
        const res = await fetch(`https://api.mercadopago.com/v1/payments/${cleanMpPaymentId}`, {
          headers: { 'Authorization': `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) mpData = await res.json();
      }
    } catch (fetchErr) {}

    let finalStatus = mpData?.status;
    let finalPaymentId = cleanMpPaymentId;

    if (finalStatus !== 'approved' && orderId) {
      try {
        const searchRes = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`,
          {
            headers: { 'Authorization': `Bearer ${mpAccessToken}`, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const approvedPayment = (searchData.results || []).find((p) => p.status === 'approved');
          if (approvedPayment) {
            finalStatus = 'approved';
            finalPaymentId = String(approvedPayment.id);
            mpData = approvedPayment;
          }
        }
      } catch (searchErr) {}
    }

    if (finalStatus === 'approved' && orderId && mpData) {
      await applyPaymentApproval(orderId, finalPaymentId, mpData);
      return jsonNoCache({ status: "approved" });
    }

    return jsonNoCache({ status: "pending" });

  } catch (error) {
    console.error("[PaymentStatus] Erro geral:", error.message);
    return jsonNoCache({ status: "pending", error: error.message });
  }
}
