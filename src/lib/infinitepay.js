import { resolverSiteUrl } from './siteUrl.js';

const INFINITEPAY_BASE_URL = 'https://api.checkout.infinitepay.io';

export function getInfinitePayCredentials(env = {}) {
  const handle = String(env?.INFINITEPAY_HANDLE || process.env.INFINITEPAY_HANDLE || '').trim();
  const apiKey = String(env?.INFINITEPAY_API_KEY || process.env.INFINITEPAY_API_KEY || '').trim();
  return { handle, apiKey };
}

/**
 * Cria um link de checkout da InfinitePay via API oficial.
 *
 * @param {object} params
 * @param {string} params.orderId - ID do pedido no NS Music
 * @param {string} [params.sku] - SKU do produto
 * @param {number} params.amount - Valor em Reais (ex: 9.99 ou 16.89)
 * @param {string} [params.customerName] - Nome do pagador
 * @param {string} [params.customerPhone] - Telefone do pagador (+55...)
 * @param {string} [params.customerEmail] - E-mail do pagador
 * @param {string} [params.redirectUrl] - URL de retorno após o pagamento
 * @param {string} [params.cancelUrl] - URL de cancelamento
 * @param {object} [env] - Contexto de ambiente (Cloudflare Pages)
 * @returns {Promise<{ ok: boolean, url: string, slug: string, orderNsu: string, amount: number }>}
 */
export async function createInfinitePayCheckoutLink(params, env = {}) {
  const { handle, apiKey } = getInfinitePayCredentials(env);
  if (!handle || !apiKey) {
    throw new Error('Credenciais da InfinitePay (INFINITEPAY_HANDLE ou INFINITEPAY_API_KEY) não configuradas.');
  }

  const {
    orderId,
    sku = 'audio_only',
    amount,
    customerName,
    customerPhone,
    customerEmail,
    redirectUrl,
    cancelUrl,
  } = params;

  if (!orderId) {
    throw new Error('orderId é obrigatório para gerar o link da InfinitePay.');
  }

  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw new Error(`Valor inválido para a cobrança da InfinitePay: ${amount}`);
  }

  const siteUrl = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL);
  const successRedirect = redirectUrl || `${siteUrl}/entrega?orderId=${encodeURIComponent(orderId)}&paid=infinitepay`;
  const webhookUrl = `${siteUrl}/api/webhooks/infinitepay`;

  const priceInCents = Math.round(numAmount * 100);

  const payload = {
    handle,
    order_nsu: String(orderId),
    redirect_url: successRedirect,
    webhook_url: webhookUrl,
    items: [
      {
        description: 'Música Personalizada com IA - NS Music',
        quantity: 1,
        price: priceInCents,
      },
    ],
  };

  if (customerName || customerPhone || customerEmail) {
    const cust = {};
    if (customerName && String(customerName).trim().length > 1) {
      cust.name = String(customerName).trim();
    }
    if (customerPhone) {
      const cleanPhone = String(customerPhone).replace(/\D/g, '');
      if (cleanPhone.length >= 10 && cleanPhone.length <= 13) {
        cust.phone_number = cleanPhone.startsWith('55') ? `+${cleanPhone}` : `+55${cleanPhone}`;
      }
    }
    if (customerEmail && String(customerEmail).includes('@')) {
      cust.email = String(customerEmail).trim();
    }
    if (Object.keys(cust).length > 0) {
      payload.customer = cust;
    }
  }

  const res = await fetch(`${INFINITEPAY_BASE_URL}/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`InfinitePay API respondeu status ${res.status}: ${errText}`);
  }

  const data = await res.json().catch(() => null);
  if (!data?.url) {
    throw new Error('Resposta da InfinitePay não continha a URL de checkout.');
  }

  // Extrai o slug da URL (ex: https://checkout.infinitepay.io/handle/SLUG)
  let slug = '';
  try {
    const urlObj = new URL(data.url);
    const parts = urlObj.pathname.split('/').filter(Boolean);
    slug = parts[parts.length - 1] || '';
  } catch (e) {
    slug = data.url.split('/').pop() || '';
  }

  return {
    ok: true,
    url: data.url,
    slug,
    orderNsu: orderId,
    amount: numAmount,
  };
}

/**
 * Consulta o status de um pagamento na InfinitePay via /payment_check.
 *
 * @param {object} params
 * @param {string} params.orderNsu - ID do pedido no NS Music
 * @param {string} params.slug - Código da fatura (slug)
 * @param {string} [params.transactionNsu] - ID único da transação gerado pela InfinitePay
 * @param {object} [env]
 * @returns {Promise<{ ok: boolean, paid: boolean, paidAmount: number, captureMethod: string, raw: object }>}
 */
export async function checkInfinitePayPayment(params, env = {}) {
  const { handle, apiKey } = getInfinitePayCredentials(env);
  if (!handle || !apiKey) {
    throw new Error('Credenciais da InfinitePay não configuradas.');
  }

  const { orderNsu, slug, transactionNsu } = params;

  const payload = {
    handle,
    order_nsu: String(orderNsu || ''),
    slug: String(slug || ''),
  };
  if (transactionNsu) {
    payload.transaction_nsu = String(transactionNsu);
  }

  const res = await fetch(`${INFINITEPAY_BASE_URL}/payment_check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha ao checar pagamento na InfinitePay (${res.status}): ${errText}`);
  }

  const data = await res.json().catch(() => null);
  const isPaid = Boolean(data?.paid === true || data?.success === true);
  const paidCents = Number(data?.paid_amount ?? data?.amount) || 0;
  const paidAmount = paidCents > 0 ? paidCents / 100 : 0;

  return {
    ok: true,
    paid: isPaid,
    paidAmount,
    captureMethod: data?.capture_method || 'credit_card',
    installments: data?.installments || 1,
    raw: data,
  };
}
