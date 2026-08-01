import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore/lite';
import { dbEdge } from '@/lib/firebase-edge';
// AVISO IMPORTANTE: Não importar @/lib/firebase ou firebase/firestore aqui, pois quebram o Edge Runtime

export const runtime = 'edge';

async function processPayment(rawPaymentId) {
  if (!rawPaymentId) return false;

  // Extrai puramente os dígitos numéricos (remove sufixos/prefixos estranhos como :1)
  const numericMatch = String(rawPaymentId).match(/\d+/);
  const paymentId = numericMatch ? numericMatch[0] : String(rawPaymentId).replace(/\D/g, '');

  if (!paymentId) return false;

  let accessToken = '';
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.MERCADO_PAGO_ACCESS_TOKEN) {
      accessToken = String(ctx.env.MERCADO_PAGO_ACCESS_TOKEN).trim();
    }
  } catch (e) {}

  if (!accessToken) {
    accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
  }

  if (!accessToken) {
    console.error("[Webhook MP] Token do Mercado Pago não configurado.");
    return false;
  }

  // Consultar detalhes do pagamento na API do Mercado Pago
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!mpRes.ok) {
    console.warn(`[Webhook MP] Erro ao consultar pagamento ${paymentId} no Mercado Pago:`, await mpRes.text());
    return false;
  }

  const paymentData = await mpRes.json();
  const status = paymentData.status;
  const orderId = paymentData.external_reference;

  console.log(`[Webhook MP] PaymentID: ${paymentId}, Status: ${status}, OrderID: ${orderId}`);

  let finalStatus = status;
  let finalPaymentId = paymentId;
  let finalMpData = paymentData;

  // Busca de fallback por external_reference caso o ID específico esteja pendente
  if (status !== 'approved' && orderId) {
    try {
      const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${orderId}&sort=date_created&criteria=desc&limit=5`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const approvedPayment = (searchData.results || []).find(p => p.status === 'approved');
        if (approvedPayment) {
          console.log(`[Webhook MP] ✅ Encontrado pagamento aprovado via search para orderId=${orderId}: ${approvedPayment.id}`);
          finalStatus = 'approved';
          finalPaymentId = String(approvedPayment.id);
          finalMpData = approvedPayment;
        }
      }
    } catch (e) {
      console.warn("[Webhook MP] Erro no fallback de busca:", e);
    }
  }

  if (finalStatus === 'approved') {
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
      const q = query(ordersRef, where('paymentId', '==', String(finalPaymentId)));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        const docSnap = querySnap.docs[0];
        targetOrderRef = doc(dbEdge, 'orders', docSnap.id);
        orderData = docSnap.data();
      }
    }

    if (targetOrderRef && orderData) {
      const isVideoPayment = String(finalPaymentId) === String(orderData.videoPaymentId) ||
                             Math.abs(Number(finalMpData.transaction_amount) - 6.90) < 0.01;

      const updates = {
        paymentStatus: 'PAGAMENTO_APROVADO',
        updatedAt: new Date().toISOString()
      };

      if (isVideoPayment) {
        updates.hasVideoAccess = true;
        updates.videoAddonPaid = true;
        updates.videoPaymentId = String(finalPaymentId);
        console.log(`[Webhook MP] Pedido ${targetOrderRef.id} - Vídeo Add-on aprovado!`);
      } else {
        updates.paymentId = String(finalPaymentId);
        updates.paidAt = new Date().toISOString();
        console.log(`[Webhook MP] Pedido ${targetOrderRef.id} marcado como PAGAMENTO_APROVADO!`);
      }

      await updateDoc(targetOrderRef, updates);

      // Notifica por WhatsApp — isolado
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
                await updateDoc(targetOrderRef, {
                  [`${sentFlag}Sending`]: true
                });
                shouldSend = true;
                customerName = freshData.customerName || 'Cliente';
                honoreeName = freshData.honoreeName || 'alguém especial';
              }
            }
          } catch (txErr) {
            console.warn("[Webhook MP] Erro ao verificar flag de WhatsApp:", txErr);
          }

          if (shouldSend) {
            const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
            const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;
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
              console.log(`[Webhook MP] ✅ WhatsApp ${isVideoPayment ? 'vídeo' : 'pagamento'} enviado!`);
            } else {
              await updateDoc(targetOrderRef, { [`${sentFlag}Sending`]: false }).catch(e => console.warn(e));
            }
          }
        }
      } catch (whatsappErr) {
        console.error("[Webhook MP] Erro geral no envio de WhatsApp:", whatsappErr);
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

    let paymentId = body?.data?.id || body?.id || searchParams.get('data.id') || searchParams.get('id');

    if (!paymentId && body?.resource) {
      const parts = body.resource.split('/');
      paymentId = parts[parts.length - 1];
    }

    if (paymentId) {
      await processPayment(paymentId);
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

    console.log("[Webhook MP GET] Notificação recebida:", { topic, paymentId });

    if (paymentId) {
      await processPayment(paymentId);
    }

    return NextResponse.json({ status: 'ok', message: 'Webhook Mercado Pago ativo' });
  } catch (error) {
    console.error("Erro no Webhook Mercado Pago (GET):", error);
    return NextResponse.json({ status: 'ok' });
  }
}
