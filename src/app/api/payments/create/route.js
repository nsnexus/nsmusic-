import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const { formData, totalAmount, paymentType = 'pix', orderId } = body;

    let pagbankToken = '';
    let pagbankEnv = 'production';
    let mpToken = '';
    let siteUrl = '';

    try {
      const ctx = getRequestContext();
      if (ctx?.env?.PAGBANK_TOKEN) pagbankToken = String(ctx.env.PAGBANK_TOKEN).trim();
      if (ctx?.env?.PAGBANK_ENV) pagbankEnv = String(ctx.env.PAGBANK_ENV).trim();
      if (ctx?.env?.MERCADO_PAGO_ACCESS_TOKEN) mpToken = String(ctx.env.MERCADO_PAGO_ACCESS_TOKEN).trim();
      if (ctx?.env?.NEXT_PUBLIC_SITE_URL) siteUrl = String(ctx.env.NEXT_PUBLIC_SITE_URL).trim();
    } catch (e) {}

    if (!pagbankToken) pagbankToken = String(process.env.PAGBANK_TOKEN || '').trim();
    if (!pagbankEnv || pagbankEnv !== 'sandbox') pagbankEnv = String(process.env.PAGBANK_ENV || 'production').trim();
    if (!mpToken) mpToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN || '').trim();
    if (!siteUrl) siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://nsmusic.nsnexus.com.br').trim();

    // ── 1. Se tiver token do PagBank, usa o PagBank para PIX ──
    if (pagbankToken) {
      const baseUrl = pagbankEnv === 'sandbox' 
        ? 'https://sandbox.api.pagseguro.com' 
        : 'https://api.pagseguro.com';

      const customerName = (formData?.customerName || 'Cliente').trim();
      const customerEmail = (formData?.customerEmail && String(formData.customerEmail).includes('@'))
        ? String(formData.customerEmail).trim()
        : 'contato@nsmusic.com.br';
      
      const amountInCents = Math.round(Number(totalAmount) * 100);

      const pagbankPayload = {
        reference_id: orderId || `NS-${Date.now()}`,
        customer: {
          name: customerName,
          email: customerEmail,
          tax_id: "00851895298" // Fallback CPF exigido pelo PagBank para geração de PIX
        },
        items: [
          {
            reference_id: orderId || `ITEM-${Date.now()}`,
            name: `Música Personalizada - Homenagem a ${formData?.honoreeName || 'Alguém'}`,
            quantity: 1,
            unit_amount: amountInCents
          }
        ],
        qr_codes: [
          {
            amount: {
              value: amountInCents
            },
            expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }
        ],
        notification_urls: [
          `${siteUrl}/api/webhooks/pagbank`
        ]
      };

      const res = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${pagbankToken}`,
          'Content-Type': 'application/json',
          'accept': 'application/json'
        },
        body: JSON.stringify(pagbankPayload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[PagBank] Erro ao criar ordem PIX:", errText);
        throw new Error(`Erro na API do PagBank: ${errText}`);
      }

      const orderData = await res.json();
      const qrCodeObj = orderData.qr_codes?.[0] || {};
      const qrCodeText = qrCodeObj.text || '';
      
      // Busca imagem PNG ou URL do QR Code
      const qrCodePngLink = qrCodeObj.links?.find(l => l.rel === 'QRCODE.PNG' || l.media?.includes('image'))?.href || '';

      if (orderId && orderData.id) {
        try {
          const { doc, updateDoc } = await import('firebase/firestore');
          const { db } = await import('@/lib/firebase');
          const updatePayload = body.isSecondaryPayment 
            ? { videoPaymentId: String(orderData.id), updatedAt: new Date().toISOString() }
            : { paymentId: String(orderData.id), updatedAt: new Date().toISOString() };
            
          await updateDoc(doc(db, 'orders', orderId), updatePayload).catch(e => console.warn(e));
        } catch (e) {
          console.warn("Aviso ao vincular paymentId do PagBank ao pedido:", e);
        }
      }

      return NextResponse.json({
        paymentId: orderData.id,
        status: orderData.status || 'PENDING',
        qrCode: qrCodeText,
        qrCodeBase64: qrCodePngLink,
        ticketUrl: qrCodePngLink
      });
    }

    // ── 2. Fallback Mercado Pago (caso PAGBANK_TOKEN não esteja definido) ──
    if (mpToken) {
      if (paymentType === 'pix') {
        const rawFirstName = (formData?.customerName || 'Cliente').trim().split(' ')[0] || 'Cliente';
        const rawLastName = (formData?.customerName || '').trim().split(' ').slice(1).join(' ').trim();
        const email = (formData?.customerEmail && String(formData.customerEmail).includes('@')) 
          ? String(formData.customerEmail).trim() 
          : 'contato@nsmusic.com.br';

        const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mpToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `pix_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`
          },
          body: JSON.stringify({
            transaction_amount: Number(Number(totalAmount).toFixed(2)),
            description: `Música Personalizada para ${formData?.honoreeName || 'Alguém'}`,
            payment_method_id: 'pix',
            external_reference: orderId || '',
            notification_url: `${siteUrl}/api/webhooks/mercadopago`,
            payer: {
              email: email,
              first_name: rawFirstName,
              last_name: rawLastName || 'NSMusic',
            }
          })
        });

        if (!pixResponse.ok) {
          const errText = await pixResponse.text();
          throw new Error(`Erro na geração do Pix Mercado Pago: ${errText}`);
        }

        const pixData = await pixResponse.json();
        const transactionData = pixData.point_of_interaction?.transaction_data || {};

        if (orderId && pixData.id) {
          try {
            const { doc, updateDoc } = await import('firebase/firestore');
            const { db } = await import('@/lib/firebase');
            const updatePayload = body.isSecondaryPayment 
              ? { videoPaymentId: String(pixData.id), updatedAt: new Date().toISOString() }
              : { paymentId: String(pixData.id), updatedAt: new Date().toISOString() };
              
            await updateDoc(doc(db, 'orders', orderId), updatePayload).catch(e => console.warn(e));
          } catch (e) {}
        }

        return NextResponse.json({
          paymentId: pixData.id,
          status: pixData.status,
          qrCode: transactionData.qr_code,
          qrCodeBase64: transactionData.qr_code_base64,
          ticketUrl: transactionData.ticket_url
        });
      }
    }

    throw new Error("Nenhum token de gateway de pagamento (PAGBANK_TOKEN ou MERCADO_PAGO_ACCESS_TOKEN) está configurado no servidor.");

  } catch (error) {
    console.error("Erro ao criar pagamento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
