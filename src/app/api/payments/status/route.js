import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';

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
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');
    const orderId = searchParams.get('orderId');

    // ── 1. Verificação rápida no Firestore ──
    let orderData = null;
    if (orderId) {
      try {
        const orderSnap = await getDoc(doc(dbEdge, 'orders', orderId));
        if (orderSnap.exists()) {
          orderData = orderSnap.data();

          // Atalho só é seguro quando o paymentId consultado é EXATAMENTE o que já foi
          // verificado e aprovado antes (guardado em paymentId/videoPaymentId por
          // applyPaymentApproval). Um pedido já aprovado (paymentStatus) não significa que
          // QUALQUER OUTRO paymentId consultado nele também esteja pago — isso permitia liberar
          // o add-on de vídeo (cobrança nova, nunca verificada) de graça em qualquer pedido cuja
          // música já tivesse sido paga antes. Qualquer paymentId que não bater aqui cai no fluxo
          // normal abaixo, que sempre reconsulta a Efí antes de aprovar.
          if (paymentId && String(paymentId) === String(orderData.paymentId)) {
            return jsonNoCache({ status: "approved" });
          }
          if (paymentId && String(paymentId) === String(orderData.videoPaymentId) &&
              (orderData.hasVideoAccess || orderData.videoAddonPaid)) {
            return jsonNoCache({ status: "approved" });
          }
        }
      } catch (quickCheckErr) {
        console.warn("[PaymentStatus] Erro na verificação rápida no DB:", quickCheckErr.message);
      }
    }

    // txid da cobrança Efí: vem do parâmetro paymentId (fluxo normal) ou, na ausência dele, do que
    // foi persistido em /api/payments/create (paymentIntentId).
    const txid = paymentId || orderData?.paymentIntentId;
    if (!txid) {
      return jsonNoCache({ status: "pending", error: "Missing parameters" }, 400);
    }

    let charge;
    try {
      charge = await getChargeStatus(txid, env);
    } catch (err) {
      console.warn("[PaymentStatus] Erro ao consultar a Efí:", err.message);
      return jsonNoCache({ status: "pending" });
    }

    if (charge?.status === 'CONCLUIDA' && orderId) {
      const transactionAmount = Number(charge.valor?.original);
      await applyPaymentApproval(orderId, txid, { status: 'approved', transaction_amount: transactionAmount });
      return jsonNoCache({ status: "approved" });
    }

    return jsonNoCache({ status: "pending" });

  } catch (error) {
    console.error("[PaymentStatus] Erro geral:", error.message);
    return jsonNoCache({ status: "pending", error: error.message });
  }
}
