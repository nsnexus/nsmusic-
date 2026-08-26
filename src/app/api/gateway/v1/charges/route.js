import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { authenticateGatewayRequest, createGatewayPixCharge } from '@/lib/gateway';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    // 1. Autenticação por chave de API
    const auth = authenticateGatewayRequest(req, env);
    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'Não autorizado. Chave de API de Gateway inválida ou não configurada.' },
        { status: 401 }
      );
    }

    // 2. Parse do body
    let body = {};
    try {
      body = await req.json();
    } catch (err) {
      return NextResponse.json({ error: 'Corpo da requisição deve ser um JSON válido.' }, { status: 400 });
    }

    const { appId, externalOrderId, amount, description, payer, webhookUrl, webhookSecret } = body;

    if (!appId || !externalOrderId || amount === undefined) {
      return NextResponse.json(
        { error: 'Campos obrigatórios ausentes: appId, externalOrderId e amount.' },
        { status: 400 }
      );
    }

    // 3. Criação da cobrança
    const charge = await createGatewayPixCharge({
      appId,
      externalOrderId,
      amount,
      description,
      payer,
      webhookUrl,
      webhookSecret,
    }, env);

    return NextResponse.json({
      success: true,
      txid: charge.txid,
      pixCopiaECola: charge.pixCopiaECola,
      status: charge.status,
      amount: charge.amount,
      appId: charge.appId,
      externalOrderId: charge.externalOrderId,
      createdAt: charge.createdAt,
    }, { status: 201 });

  } catch (error) {
    console.error('[POST /api/gateway/v1/charges] Erro:', error.message);
    return NextResponse.json({ error: error.message || 'Falha ao criar cobrança de gateway.' }, { status: 500 });
  }
}
