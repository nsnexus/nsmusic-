import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';

export const runtime = 'edge';

function getPagBankConfig() {
  let token = '';
  let env = 'production';
  
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.PAGBANK_TOKEN) token = String(ctx.env.PAGBANK_TOKEN).trim();
    if (ctx?.env?.PAGBANK_ENV) env = String(ctx.env.PAGBANK_ENV).trim();
  } catch (e) {}

  if (!token) token = String(process.env.PAGBANK_TOKEN || '').trim();
  if (!env || env !== 'sandbox') env = String(process.env.PAGBANK_ENV || 'production').trim();

  const baseUrl = env === 'sandbox' 
    ? 'https://sandbox.api.pagseguro.com' 
    : 'https://api.pagseguro.com';

  return { token, baseUrl };
}

async function processPagBankOrder(orderOrPaymentId) {
  if (!orderOrPaymentId) return false;

  const { token, baseUrl } = getPagBankConfig();
  if (!token) {
    console.error("[Webhook PagBank] Token do PagBank não configurado nas variáveis de ambiente.");
    return false;
  }

  // 1. Consultar status real da Ordem na API oficial do PagBank
  const cleanId = String(orderOrPaymentId).trim();
  let pagBankData = null;

  try {
    const res = await fetch(`${baseUrl}/orders/${cleanId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'accept': 'application/json'
      }
    });

    if (res.ok) {
      pagBankData = await res.json();
    } else {
      console.warn(`[Webhook PagBank] Não foi possível consultar a ordem ${cleanId}: ${await res.text()}`);
      return false;
    }
  } catch (err) {
    console.error("[Webhook PagBank] Erro de rede ao consultar PagBank:", err);
    return false;
  }

  if (!pagBankData) return false;

  // 2. Verificar se o status é 'PAID' (ou se a cobrança em charges está 'PAID')
  const orderStatus = String(pagBankData.status || '').toUpperCase();
  const charges = pagBankData.charges || [];
  const isPaid = orderStatus === 'PAID' || charges.some(c => String(c.status || '').toUpperCase() === 'PAID');

  const orderId = pagBankData.reference_id || cleanId;
  console.log(`[Webhook PagBank] Order/Payment ID: ${cleanId}, Status: ${orderStatus}, ReferenceID: ${orderId}`);

  if (isPaid) {
    let targetOrderRef = null;
    let orderData = null;

    if (orderId) {
      targetOrderRef = doc(dbEdge, 'orders', orderId);
      const orderSnap = await getDoc(targetOrderRef);
      if (orderSnap.exists()) {
        orderData = orderSnap.data();
      }
    }

    if (!orderData) {
      const ordersRef = collection(dbEdge, 'orders');
      const q = query(ordersRef, where('paymentId', '==', cleanId));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const docSnap = querySnap.docs[0];
        targetOrderRef = doc(dbEdge, 'orders', docSnap.id);
        orderData = docSnap.data();
      }
    }

    if (targetOrderRef && orderData) {
      const isVideoPayment = String(cleanId) === String(orderData.videoPaymentId) ||
                             (charges.length > 0 && Math.abs((Number(charges[0]?.amount?.value || 0) / 100) - 6.90) < 0.01);

      const updates = {
        paymentStatus: 'PAGAMENTO_APROVADO',
        updatedAt: new Date().toISOString()
      };

      if (isVideoPayment) {
        updates.hasVideoAccess = true;
        updates.videoAddonPaid = true;
        updates.videoPaymentId = cleanId;
        console.log(`[Webhook PagBank] Pedido ${targetOrderRef.id} - Vídeo Add-on aprovado!`);
      } else {
        updates.paymentId = cleanId;
        updates.paidAt = new Date().toISOString();
        console.log(`[Webhook PagBank] Pedido ${targetOrderRef.id} marcado como PAGAMENTO_APROVADO!`);
      }

      await updateDoc(targetOrderRef, updates);

      // Notificação por WhatsApp (isolada em try/catch)
      try {
        if (orderData.customerPhone) {
          const sentFlag = isVideoPayment ? 'videoPaymentWhatsappSent' : 'paymentWhatsappSent';
          let shouldSend = false;
          let customerName = '';
          let honoreeName = '';

          try {
            const freshSnap = await getDoc(targetOrderRef);
            if (freshSnap.exists()) {
              const freshData = freshSnap.data();
              if (!freshData[sentFlag] && !freshData[`${sentFlag}Sending`]) {
                await updateDoc(targetOrderRef, { [`${sentFlag}Sending`]: true });
                shouldSend = true;
                customerName = freshData.customerName || 'Cliente';
                honoreeName = freshData.honoreeName || 'alguém especial';
              }
            }
          } catch (txErr) {
            console.warn("[Webhook PagBank] Erro ao verificar flag de WhatsApp:", txErr);
          }

          if (shouldSend) {
            const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
            const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) 
              ? 'https://nsmusic.nsnexus.com.br' 
              : rawUrl;
            const deliveryUrl = `${baseUrl}/entrega?orderId=${targetOrderRef.id}`;

            let messageText;
            if (isVideoPayment) {
              messageText = `Olá, ${customerName}! 🎬\n\nSeu pagamento do *Vídeo Homenagem* foi confirmado com sucesso!\nAgora você pode enviar suas fotos para criar o vídeo personalizado para *${honoreeName}*.\n\nAcesse o link abaixo para enviar as fotos:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
            } else {
              messageText = `Olá, ${customerName}! 🎵\n\nSeu pagamento foi confirmado com sucesso!\nSua música personalizada para *${honoreeName}* foi totalmente liberada no estúdio NSMusic.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
            }

            const { sendWhatsAppMessage } = await import('@/lib/whatsapp');
            const sent = await sendWhatsAppMessage(orderData.customerPhone, messageText);

            if (sent) {
              await updateDoc(targetOrderRef, {
                [sentFlag]: true,
                [`${sentFlag}At`]: new Date().toISOString(),
                [`${sentFlag}Sending`]: false
              }).catch(e => console.warn(e));
              console.log(`[Webhook PagBank] ✅ WhatsApp enviado!`);
            } else {
              await updateDoc(targetOrderRef, { [`${sentFlag}Sending`]: false }).catch(e => console.warn(e));
            }
          }
        }
      } catch (whatsappErr) {
        console.error("[Webhook PagBank] Erro no envio de WhatsApp:", whatsappErr);
      }
    }
  }

  return true;
}

export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url);
    let body = {};
    try {
      body = await req.json();
    } catch (e) {}

    const orderId = body?.id || body?.order_id || body?.reference_id || searchParams.get('id') || searchParams.get('order_id');

    if (orderId) {
      await processPagBankOrder(orderId);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Erro no processamento do Webhook PagBank (POST):", error);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('id') || searchParams.get('order_id') || searchParams.get('reference_id');

    if (orderId) {
      await processPagBankOrder(orderId);
    }

    return NextResponse.json({ status: 'ok', message: 'Webhook PagBank ativo' });
  } catch (error) {
    console.error("Erro no Webhook PagBank (GET):", error);
    return NextResponse.json({ status: 'ok' });
  }
}
