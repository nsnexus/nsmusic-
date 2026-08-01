import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';

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
        console.warn("[PaymentStatus] Erro na verificação rápida no DB:", quickCheckErr);
      }
    }

    if (!paymentId && !orderId) {
      return jsonNoCache({ status: "pending", error: "Missing parameters" }, 400);
    }

    const cleanPaymentId = String(paymentId || '').trim();

    let pagbankToken = '';
    let pagbankEnv = 'production';
    let mpAccessToken = '';

    try {
      const ctx = getRequestContext();
      if (ctx?.env?.PAGBANK_TOKEN) pagbankToken = String(ctx.env.PAGBANK_TOKEN).trim();
      if (ctx?.env?.PAGBANK_ENV) pagbankEnv = String(ctx.env.PAGBANK_ENV).trim();
      if (ctx?.env?.MERCADO_PAGO_ACCESS_TOKEN) mpAccessToken = String(ctx.env.MERCADO_PAGO_ACCESS_TOKEN).trim();
    } catch (e) {}

    if (!pagbankToken) pagbankToken = String(process.env.PAGBANK_TOKEN || '').trim();
    if (!pagbankEnv || pagbankEnv !== 'sandbox') pagbankEnv = String(process.env.PAGBANK_ENV || 'production').trim();
    if (!mpAccessToken) mpAccessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();

    // ── 2. Consulta PagBank se Token estiver presente ──
    if (pagbankToken && cleanPaymentId) {
      const baseUrl = pagbankEnv === 'sandbox' 
        ? 'https://sandbox.api.pagseguro.com' 
        : 'https://api.pagseguro.com';

      try {
        const res = await fetch(`${baseUrl}/orders/${cleanPaymentId}`, {
          headers: {
            'Authorization': `Bearer ${pagbankToken}`,
            'accept': 'application/json'
          }
        });

        if (res.ok) {
          const pbData = await res.json();
          const pbStatus = String(pbData.status || '').toUpperCase();
          const charges = pbData.charges || [];
          const isPaid = pbStatus === 'PAID' || charges.some(c => String(c.status || '').toUpperCase() === 'PAID');

          if (isPaid) {
            orderId = orderId || pbData.reference_id;
            if (orderId) {
              await markOrderApproved(orderId, cleanPaymentId, charges[0]?.amount?.value ? Number(charges[0].amount.value) / 100 : 0);
            }
            return jsonNoCache({ status: "approved" });
          } else {
            return jsonNoCache({ status: "pending" });
          }
        }
      } catch (pbErr) {
        console.warn("[PaymentStatus] Erro ao consultar PagBank:", pbErr);
      }
    }

    // ── 3. Fallback Mercado Pago ──
    if (mpAccessToken) {
      const numericMatch = String(paymentId || '').match(/\d+/);
      const cleanMpPaymentId = numericMatch ? numericMatch[0] : String(paymentId || '').trim();

      let mpData = null;
      try {
        if (cleanMpPaymentId) {
          const res = await fetch(`https://api.mercadopago.com/v1/payments/${cleanMpPaymentId}`, {
            headers: {
              'Authorization': `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json'
            }
          });
          if (res.ok) mpData = await res.json();
        }
      } catch (fetchErr) {}

      let finalStatus = mpData?.status;
      let finalPaymentId = cleanMpPaymentId;

      if (finalStatus !== 'approved' && orderId) {
        try {
          const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`, {
            headers: {
              'Authorization': `Bearer ${mpAccessToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const approvedPayment = (searchData.results || []).find(p => p.status === 'approved');
            if (approvedPayment) {
              finalStatus = 'approved';
              finalPaymentId = String(approvedPayment.id);
            }
          }
        } catch (searchErr) {}
      }

      if (finalStatus === 'approved' && orderId) {
        await markOrderApproved(orderId, finalPaymentId, mpData?.transaction_amount || 0);
        return jsonNoCache({ status: "approved" });
      }
    }

    return jsonNoCache({ status: "pending" });

  } catch (error) {
    console.error("[PaymentStatus] Erro geral:", error);
    return jsonNoCache({ status: "pending", error: error.message });
  }
}

async function markOrderApproved(orderId, paymentId, amount) {
  try {
    const orderRef = doc(dbEdge, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    const orderData = orderSnap.exists() ? orderSnap.data() : {};

    const isVideoPayment = String(paymentId) === String(orderData.videoPaymentId) ||
                           (amount > 0 && Math.abs(amount - 6.90) < 0.01);

    const updates = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      updatedAt: new Date().toISOString()
    };

    if (isVideoPayment) {
      updates.hasVideoAccess = true;
      updates.videoAddonPaid = true;
      updates.videoPaymentId = paymentId;
    } else {
      updates.paymentId = paymentId;
    }

    await updateDoc(orderRef, updates);

    // Envio de WhatsApp (isolado)
    try {
      if (orderData.customerPhone) {
        const sentFlag = isVideoPayment ? 'videoPaymentWhatsappSent' : 'paymentWhatsappSent';
        let shouldSend = false;
        let customerName = '';
        let honoreeName = '';

        const freshSnap = await getDoc(orderRef);
        if (freshSnap.exists()) {
          const freshData = freshSnap.data();
          if (!freshData[sentFlag] && !freshData[`${sentFlag}Sending`]) {
            await updateDoc(orderRef, { [`${sentFlag}Sending`]: true });
            shouldSend = true;
            customerName = freshData.customerName || 'Cliente';
            honoreeName = freshData.honoreeName || 'alguém especial';
          }
        }

        if (shouldSend) {
          const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
          const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) 
            ? 'https://nsmusic.nsnexus.com.br' 
            : rawUrl;
          const deliveryUrl = `${baseUrl}/entrega?orderId=${orderId}`;

          let messageText;
          if (isVideoPayment) {
            messageText = `Olá, ${customerName}! 🎬\n\nSeu pagamento do *Vídeo Homenagem* foi confirmado com sucesso!\nAgora você pode enviar suas fotos para criar o vídeo personalizado para *${honoreeName}*.\n\nAcesse o link abaixo para enviar as fotos:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
          } else {
            messageText = `Olá, ${customerName}! 🎵\n\nSeu pagamento foi confirmado com sucesso!\nSua música personalizada para *${honoreeName}* foi totalmente liberada no estúdio NSMusic.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
          }

          const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
          const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);

          if (sent) {
            await updateDoc(orderRef, {
              [sentFlag]: true,
              [`${sentFlag}At`]: new Date().toISOString(),
              [`${sentFlag}Sending`]: false
            }).catch(e => console.warn(e));
          } else {
            await updateDoc(orderRef, { [`${sentFlag}Sending`]: false }).catch(e => console.warn(e));
          }
        }
      }
    } catch (whatsappErr) {
      console.error("[PaymentStatus] Erro no envio de WhatsApp:", whatsappErr);
    }
  } catch (err) {
    console.warn("[PaymentStatus] Erro ao atualizar pedido aprovado:", err);
  }
}
