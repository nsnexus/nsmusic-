import { MercadoPagoConfig, Preference } from 'mercadopago';
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { formData, totalAmount } = body;

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    if (!accessToken) {
      console.warn("MERCADO_PAGO_ACCESS_TOKEN não configurada. Usando pagamento simulado.");
      return NextResponse.json({
        init_point: `${siteUrl}/acompanhar?id=MOCK-ORDER-12345`
      });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
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
          success: `${siteUrl}/acompanhar?id=order_${Date.now()}&status=success`,
          failure: `${siteUrl}/criar?status=failure`,
          pending: `${siteUrl}/acompanhar?id=order_${Date.now()}&status=pending`,
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/api/webhooks/mercadopago`,
      }
    });

    return NextResponse.json({ init_point: result.init_point });
  } catch (error) {
    console.error("Erro ao criar preferência de pagamento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
