import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const { formData, totalAmount, paymentType = 'preference' } = body;

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    if (!accessToken) {
      throw new Error("Mercado Pago access token is not configured in environment variables.");
    }

    if (paymentType === 'pix') {
      // Direct Pix generation via Mercado Pago API
      const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `pix_${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: Number(totalAmount),
          description: `Música Personalizada para ${formData.honoreeName || 'Alguém'}`,
          payment_method_id: 'pix',
          payer: {
            email: formData.customerEmail || 'contato@nsmusic.com.br',
            first_name: formData.customerName?.split(' ')[0] || 'Cliente',
            last_name: formData.customerName?.split(' ').slice(1).join(' ') || 'NSMusic',
          }
        })
      });

      if (!pixResponse.ok) {
        const errText = await pixResponse.text();
        console.error("Erro na API Pix do Mercado Pago:", errText);
        throw new Error(`Erro na geração do Pix: ${errText}`);
      }

      const pixData = await pixResponse.json();
      const transactionData = pixData.point_of_interaction?.transaction_data || {};

      return NextResponse.json({
        paymentId: pixData.id,
        status: pixData.status,
        qrCode: transactionData.qr_code,
        qrCodeBase64: transactionData.qr_code_base64,
        ticketUrl: transactionData.ticket_url
      });
    }

    // Default: Preference creation for Modal/Iframe
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            id: formData.selectedPackage || 'personal_song',
            title: `Música Personalizada - Homenagem a ${formData.honoreeName || 'Alguém'}`,
            quantity: 1,
            unit_price: Number(totalAmount),
            currency_id: 'BRL',
          }
        ],
        back_urls: {
          success: `${siteUrl}/entrega?status=success`,
          failure: `${siteUrl}/criar?status=failure`,
          pending: `${siteUrl}/entrega?status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mercado Pago API error: ${errorText}`);
    }

    const result = await response.json();
    return NextResponse.json({
      preferenceId: result.id,
      init_point: result.init_point
    });
  } catch (error) {
    console.error("Erro ao criar preferência de pagamento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
