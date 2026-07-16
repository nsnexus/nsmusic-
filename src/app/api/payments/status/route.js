import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const paymentId = searchParams.get('paymentId');

    if (!paymentId) {
      return NextResponse.json({ error: "paymentId é obrigatório" }, { status: 400 });
    }

    const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
    if (!accessToken) {
      throw new Error("Token do Mercado Pago não configurado.");
    }

    const res = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      return NextResponse.json({ status: "pending" });
    }

    const data = await res.json();
    return NextResponse.json({
      status: data.status,
      statusDetail: data.status_detail
    });
  } catch (error) {
    console.error("Erro consultando status do pagamento:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
