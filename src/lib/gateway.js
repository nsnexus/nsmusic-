import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge';
import { createPixCharge, generateTxid } from './efi';

/**
 * Valida a chave de API da requisição para o Gateway.
 * Aceita via header `x-gateway-api-key` ou `Authorization: Bearer <chave>`.
 */
export function authenticateGatewayRequest(req, env = {}) {
  const configuredKey = String(env?.GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || '').trim();
  if (!configuredKey) {
    return { authorized: false, reason: 'gateway_key_not_configured' };
  }

  const authHeader = req.headers.get('authorization') || '';
  const apiKeyHeader = req.headers.get('x-gateway-api-key') || '';

  let providedKey = '';
  if (apiKeyHeader) {
    providedKey = apiKeyHeader.trim();
  } else if (authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.slice(7).trim();
  }

  if (!providedKey || providedKey !== configuredKey) {
    return { authorized: false, reason: 'invalid_api_key' };
  }

  return { authorized: true };
}

/**
 * Cria uma nova cobrança Pix de Gateway para um produto/sistema externo.
 * Persiste os dados na coleção `gateway_charges` do Firestore.
 */
export async function createGatewayPixCharge(params, env = {}) {
  const {
    appId,
    externalOrderId,
    amount,
    description,
    payer,
    webhookUrl,
    webhookSecret,
  } = params;

  if (!appId || typeof appId !== 'string') {
    throw new Error('appId é obrigatório (ex: "metodo-21-dias").');
  }

  if (!externalOrderId || typeof externalOrderId !== 'string') {
    throw new Error('externalOrderId é obrigatório.');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    throw new Error('amount deve ser um número positivo.');
  }

  // Gera o txid garantindo conformidade com a especificação Bacen (26 a 35 caracteres alfanuméricos)
  const appPrefix = appId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  const txid = generateTxid(`${appPrefix}_${externalOrderId}`);

  const chargeDesc = description || `Pagamento ${appId} - ${externalOrderId}`;

  // Cria a cobrança na Efí via proxy mTLS
  const charge = await createPixCharge({
    orderId: txid,
    amount: numAmount,
    description: chargeDesc,
  }, env);

  const nowIso = new Date().toISOString();
  const chargeDoc = {
    txid: charge.txid,
    appId: appId.trim(),
    externalOrderId: externalOrderId.trim(),
    amount: numAmount,
    description: chargeDesc,
    payer: payer || null,
    status: 'PENDING',
    webhookUrl: webhookUrl ? String(webhookUrl).trim() : null,
    webhookSecret: webhookSecret ? String(webhookSecret).trim() : null,
    webhookSent: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const chargeRef = doc(db, 'gateway_charges', charge.txid);
  await setDoc(chargeRef, chargeDoc);

  return {
    txid: charge.txid,
    pixCopiaECola: charge.pixCopiaECola,
    status: 'PENDING',
    amount: numAmount,
    appId,
    externalOrderId,
    createdAt: nowIso,
  };
}

/**
 * Busca uma cobrança do gateway pelo txid.
 */
export async function getGatewayCharge(txid) {
  if (!txid) return null;
  const chargeRef = doc(db, 'gateway_charges', String(txid));
  const snap = await getDoc(chargeRef);
  if (!snap.exists()) return null;
  return snap.data();
}

/**
 * Processa a aprovação de uma cobrança de gateway (chamado pelo webhook da Efí ou consulta de status).
 * Atualiza o status no Firestore e despacha o webhook para o sistema de origem com retry/timeout.
 */
export async function applyGatewayPaymentApproval(txid, payment, env = {}) {
  if (!txid) return { applied: false, reason: 'missing_txid' };

  const chargeRef = doc(db, 'gateway_charges', String(txid));
  const snap = await getDoc(chargeRef);
  if (!snap.exists()) {
    return { applied: false, reason: 'charge_not_found' };
  }

  const chargeData = snap.data();

  // Idempotência: não processa nem redispara webhook se já foi aprovado
  if (chargeData.status === 'PAID') {
    return { applied: false, reason: 'already_processed', chargeData };
  }

  const nowIso = new Date().toISOString();
  const paidAmount = Number(payment?.transaction_amount) || chargeData.amount;

  await updateDoc(chargeRef, {
    status: 'PAID',
    paidAmount,
    paidAt: nowIso,
    updatedAt: nowIso,
  });

  // Dispara notificação de webhook para o sistema cliente
  if (chargeData.webhookUrl) {
    await dispatchGatewayWebhook({
      ...chargeData,
      status: 'PAID',
      paidAmount,
      paidAt: nowIso,
    }, env);
  }

  return { applied: true, isGatewayCharge: true, chargeData };
}

/**
 * Dispara o Webhook HTTP POST para a URL do sistema cliente.
 */
export async function dispatchGatewayWebhook(chargeData, env = {}) {
  const { webhookUrl, webhookSecret, appId, externalOrderId, txid, paidAmount, paidAt, status } = chargeData;
  if (!webhookUrl) return;

  const payload = {
    event: 'payment.approved',
    appId,
    externalOrderId,
    txid,
    amount: paidAmount,
    status: status || 'PAID',
    paidAt: paidAt || new Date().toISOString(),
  };

  const chargeRef = doc(db, 'gateway_charges', String(txid));

  try {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'NSNexus-Gateway/1.0',
    };

    const secret = webhookSecret || env?.GATEWAY_API_KEY || process.env.GATEWAY_API_KEY || '';
    if (secret) {
      headers['X-Gateway-Signature'] = secret;
      headers['X-Gateway-Secret'] = secret;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (response.ok) {
      try {
        await updateDoc(chargeRef, {
          webhookSent: true,
          webhookSentAt: new Date().toISOString(),
          webhookHttpStatus: response.status,
        });
      } catch (e) {
        console.warn('[Gateway Webhook] Falha ao gravar status do webhook:', e.message);
      }
    } else {
      const errText = await response.text().catch(() => '');
      console.warn(`[Gateway Webhook] Cliente retornou status ${response.status}: ${errText.slice(0, 100)}`);
      try {
        await updateDoc(chargeRef, {
          webhookSent: false,
          webhookHttpStatus: response.status,
          webhookError: errText.slice(0, 200),
        });
      } catch (e) {}
    }
  } catch (err) {
    console.warn(`[Gateway Webhook] Falha ao disparar webhook para ${webhookUrl}:`, err.message);
    try {
      await updateDoc(chargeRef, {
        webhookSent: false,
        webhookError: err.message,
      });
    } catch (e) {}
  }
}
