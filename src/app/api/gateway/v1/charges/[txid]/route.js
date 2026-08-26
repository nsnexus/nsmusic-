import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { authenticateGatewayRequest, getGatewayCharge, applyGatewayPaymentApproval } from '@/lib/gateway';
import { getChargeStatus } from '@/lib/efi';

export const runtime = 'edge';

export async function GET(req, { params }) {
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

    const { txid } = params || {};
    if (!txid) {
      return NextResponse.json({ error: 'txid é obrigatório.' }, { status: 400 });
    }

    // 2. Busca local no Firestore
    let charge = await getGatewayCharge(txid);
    if (!charge) {
      return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 });
    }

    // 3. Se ainda estiver pendente, faz uma verificação ativa na Efí (auto-reconciliação sob demanda)
    if (charge.status === 'PENDING') {
      try {
        const efiCharge = await getChargeStatus(txid, env);
        if (efiCharge?.status === 'CONCLUIDA') {
          const transactionAmount = Number(efiCharge.valor?.original) || charge.amount;
          await applyGatewayPaymentApproval(txid, { status: 'approved', transaction_amount: transactionAmount }, env);
          // Recarrega o dado atualizado
          charge = await getGatewayCharge(txid);
        }
      } catch (err) {
        console.warn(`[GET /api/gateway/v1/charges/${txid}] Aviso ao consultar Efí:`, err.message);
      }
    }

    return NextResponse.json({
      success: true,
      txid: charge.txid,
      appId: charge.appId,
      externalOrderId: charge.externalOrderId,
      amount: charge.amount,
      status: charge.status,
      paidAt: charge.paidAt || null,
      paidAmount: charge.paidAmount || null,
      createdAt: charge.createdAt,
      updatedAt: charge.updatedAt,
    });

  } catch (error) {
    console.error(`[GET /api/gateway/v1/charges] Erro:`, error.message);
    return NextResponse.json({ error: error.message || 'Falha ao consultar cobrança.' }, { status: 500 });
  }
}
