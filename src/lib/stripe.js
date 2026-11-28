/**
 * Utilitários Stripe para Edge Runtime (Cloudflare Pages).
 * Comunicação direta via fetch com a Stripe REST API (zero dependências Node.js).
 * Suporte a Webhooks com assinatura HMAC-SHA256 (STRIPE_WEBHOOK_SECRET).
 */

import { getPriceForSku } from './pricing.js';
import { DOMINIO_CANONICO } from './siteUrl.js';

export function getStripeConfig(env = {}) {
  const secretKey = env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY || '';
  const publishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET || '';

  return { secretKey, publishableKey, webhookSecret };
}

/**
 * Cria uma sessão de Checkout na Stripe para pagamento com Cartão de Crédito.
 *
 * @param {object} params
 * @param {string} params.orderId ID do pedido
 * @param {string} params.sku SKU do produto ou pacote
 * @param {number} [params.amount] Valor customizado (usado apenas em casos específicos como 'impacto')
 * @param {string} [params.customerEmail] E-mail do cliente
 * @param {string} [params.customerPhone] Telefone do cliente
 * @param {string} [params.customerName] Nome do cliente
 * @param {string} [params.successUrl] URL de retorno após pagamento
 * @param {string} [params.cancelUrl] URL de retorno em caso de cancelamento
 * @param {object} [env] Contexto do Cloudflare Pages
 * @returns {Promise<{id: string, url: string}>}
 */
export async function createStripeCheckoutSession(params, env = {}) {
  const { secretKey } = getStripeConfig(env);
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY não configurada no servidor.');
  }

  const {
    orderId,
    sku = 'audio_only',
    amount: rawAmount,
    customerEmail,
    customerPhone,
    customerName,
    successUrl: customSuccessUrl,
    cancelUrl: customCancelUrl
  } = params;

  if (!orderId) {
    throw new Error('orderId é obrigatório para criar checkout Stripe.');
  }

  // Preço definido no servidor pelo SKU (nunca confia cegamente no cliente)
  let amount = rawAmount;
  if (sku !== 'impacto' || !amount) {
    amount = getPriceForSku(sku);
  }
  if (!amount || amount <= 0) {
    throw new Error(`Preço inválido para SKU: ${sku}`);
  }

  // Centavos para o Stripe (ex: R$ 9,99 = 999 centavos)
  const unitAmountInCents = Math.round(amount * 100);

  const siteUrl = env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || DOMINIO_CANONICO;
  const defaultSuccessUrl = `${siteUrl}/entrega?orderId=${encodeURIComponent(orderId)}&session_id={CHECKOUT_SESSION_ID}&paid=stripe`;
  const defaultCancelUrl = `${siteUrl}/entrega?orderId=${encodeURIComponent(orderId)}&cancel=stripe`;

  const successUrl = customSuccessUrl || defaultSuccessUrl;
  const cancelUrl = customCancelUrl || defaultCancelUrl;

  // Descrição amigável pelo SKU
  const productNamesBySku = {
    audio_only: '4 Músicas Personalizadas com IA - NS Music',
    combo_carta: '4 Músicas + 2 Cartas Virtuais - NS Music',
    combo_retrospectiva: '4 Músicas + 2 Retrospectivas - NS Music',
    combo: '4 Músicas + 2 Vídeos - NS Music',
    video_addon: 'Vídeo Homenagem (Slideshow) - NS Music',
    carta_addon: 'Carta Emocionante Narrada - NS Music',
    playback_addon: 'Playback Instrumental - NS Music',
    retrospectiva_addon: 'Retrospectiva com Fotos - NS Music',
    karaoke_addon: 'Versão Karaokê - NS Music',
    custom_voice_addon: 'Sua Voz na Música - NS Music',
    segunda_musica: 'Segunda Versão da Música - NS Music',
    creditos_pos_compra_1: '1 Crédito de Música - NS Music',
    impacto: 'Música Personalizada - NS Music'
  };

  const productName = productNamesBySku[sku] || 'Música Personalizada - NS Music';

  // Montagem do payload form-urlencoded para a API REST da Stripe
  const form = new URLSearchParams();
  form.append('mode', 'payment');
  form.append('locale', 'pt-BR');
  form.append('payment_method_types[0]', 'card');
  form.append('line_items[0][price_data][currency]', 'brl');
  form.append('line_items[0][price_data][unit_amount]', String(unitAmountInCents));
  form.append('line_items[0][price_data][product_data][name]', productName);
  form.append('line_items[0][quantity]', '1');

  form.append('client_reference_id', orderId);
  form.append('metadata[orderId]', orderId);
  form.append('metadata[sku]', sku);
  if (customerPhone) form.append('metadata[customerPhone]', customerPhone);
  if (customerName) form.append('metadata[customerName]', customerName);

  if (customerEmail && customerEmail.includes('@')) {
    form.append('customer_email', customerEmail.trim());
  }

  form.append('success_url', successUrl);
  form.append('cancel_url', cancelUrl);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  const session = await res.json();
  if (!res.ok) {
    const errMsg = session?.error?.message || 'Falha ao criar sessão de checkout na Stripe.';
    console.error('[stripe] Erro ao criar checkout session:', res.status, errMsg);
    throw new Error(errMsg);
  }

  return {
    id: session.id,
    url: session.url
  };
}

/**
 * Consulta uma Checkout Session diretamente na API da Stripe.
 *
 * @param {string} sessionId
 * @param {object} [env]
 * @returns {Promise<object>}
 */
export async function retrieveStripeCheckoutSession(sessionId, env = {}) {
  const { secretKey } = getStripeConfig(env);
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY não configurada no servidor.');
  }

  const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      'Authorization': `Bearer ${secretKey}`
    }
  });

  const data = await res.json();
  if (!res.ok) {
    const errMsg = data?.error?.message || 'Falha ao consultar sessão Stripe.';
    console.error('[stripe] Erro ao buscar checkout session:', res.status, errMsg);
    throw new Error(errMsg);
  }

  return data;
}

/**
 * Valida a assinatura de um Webhook da Stripe usando Web Crypto API.
 * 100% compatível com Edge Runtime (Cloudflare Workers/Pages).
 *
 * @param {string} rawPayload Texto bruto do corpo da requisição
 * @param {string} sigHeader Header 'stripe-signature'
 * @param {string} secret Webhook Signing Secret (whsec_...)
 * @param {number} [toleranceSeconds=300] Tolerância máxima de tempo em segundos (padrão 5 min)
 * @returns {Promise<boolean>}
 */
export async function verifyStripeWebhookSignature(rawPayload, sigHeader, secret, toleranceSeconds = 300) {
  if (!sigHeader || !secret || !rawPayload) return false;

  const parts = sigHeader.split(',');
  let timestamp = null;
  const signatures = [];

  for (const part of parts) {
    const [key, value] = part.trim().split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signatures.push(value);
  }

  if (!timestamp || signatures.length === 0) return false;

  // Verificação de tolerância de replay attack
  const now = Math.floor(Date.now() / 1000);
  const tsNum = parseInt(timestamp, 10);
  if (Number.isNaN(tsNum) || Math.abs(now - tsNum) > toleranceSeconds) {
    console.warn('[stripe] Webhook signature timestamp fora da tolerância de tempo.');
    return false;
  }

  try {
    const signedPayload = `${timestamp}.${rawPayload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBytes = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(signedPayload)
    );

    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return signatures.includes(expectedSignature);
  } catch (err) {
    console.error('[stripe] Erro ao verificar assinatura HMAC Web Crypto:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Cartão dentro do site (Payment Element): PaymentIntent criado aqui, confirmado no navegador pelo
// Stripe.js, e a aprovação só acontece depois de reconsultar o PaymentIntent na API da Stripe
// (webhook `payment_intent.succeeded` e polling de /api/payments/status com `pi_...`).
// ---------------------------------------------------------------------------------------------

/** Marca nos metadados que separa o PaymentIntent do site dos que a Stripe Checkout cria. */
export const CANAL_CARTAO_SITE = 'site';
const VALOR_MAXIMO_IMPACTO = 1000;

/**
 * Valor do cartão SEMPRE pelo catálogo do servidor. Só o SKU 'impacto' (pague quanto quiser) aceita
 * valor escolhido, com piso no preço normal e teto fixo.
 * @returns {{ valor: number } | { erro: string }}
 */
export function valorDoCartao(sku, valorPedido) {
  if (sku === 'impacto') {
    const piso = getPriceForSku('audio_only');
    const pedido = Number(valorPedido);
    if (!Number.isFinite(pedido)) return { valor: piso };
    if (pedido < piso) return { erro: `O valor mínimo é R$ ${piso.toFixed(2)}.` };
    if (pedido > VALOR_MAXIMO_IMPACTO) return { erro: `Valor muito alto. Máximo R$ ${VALOR_MAXIMO_IMPACTO.toFixed(2)}.` };
    return { valor: Math.round(pedido * 100) / 100 };
  }
  const valor = getPriceForSku(sku);
  if (valor === null || !(valor > 0)) return { erro: `SKU de produto inválido: ${sku}` };
  return { valor };
}

async function chamarStripe(caminho, { metodo = 'GET', form, idempotencia } = {}, env = {}) {
  const { secretKey } = getStripeConfig(env);
  if (!secretKey) throw new Error('STRIPE_SECRET_KEY não configurada no servidor.');
  const headers = { Authorization: `Bearer ${secretKey}` };
  if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  if (idempotencia) headers['Idempotency-Key'] = idempotencia;
  const res = await fetch(`https://api.stripe.com/v1/${caminho}`, {
    method: metodo,
    headers,
    body: form ? form.toString() : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const erro = new Error(data?.error?.message || `Stripe ${res.status}`);
    erro.status = res.status;
    erro.code = data?.error?.code;
    throw erro;
  }
  return data;
}

/**
 * PaymentIntent de cartão (inclui Google Pay / Apple Pay, que são carteiras de cartão).
 * A chave de idempotência faz o mesmo pedido + SKU + valor reaproveitar o mesmo PaymentIntent por
 * 24 h — clicar duas vezes em "Pagar com cartão" não cria duas cobranças.
 */
export async function criarPaymentIntentCartao({ orderId, sku, valor, customerEmail, descricao }, env = {}) {
  const centavos = Math.round(Number(valor) * 100);
  if (!orderId || !sku || !(centavos > 0)) throw new Error('Dados insuficientes para a cobrança no cartão.');
  const form = new URLSearchParams();
  form.append('amount', String(centavos));
  form.append('currency', 'brl');
  form.append('payment_method_types[0]', 'card');
  form.append('description', String(descricao || 'Música Personalizada - NS Music').slice(0, 200));
  form.append('statement_descriptor_suffix', 'NSMUSIC');
  form.append('metadata[orderId]', orderId);
  form.append('metadata[sku]', sku);
  form.append('metadata[canal]', CANAL_CARTAO_SITE);
  if (customerEmail && String(customerEmail).includes('@')) form.append('receipt_email', String(customerEmail).trim());
  return chamarStripe('payment_intents', { metodo: 'POST', form, idempotencia: `nsm-cartao-${orderId}-${sku}-${centavos}` }, env);
}

export async function cancelarPaymentIntent(id, env = {}) {
  if (!/^pi_[A-Za-z0-9]+$/.test(String(id || ''))) return null;
  return chamarStripe(`payment_intents/${encodeURIComponent(id)}/cancel`, { metodo: 'POST', form: new URLSearchParams() }, env);
}

export async function consultarPaymentIntent(id, env = {}) {
  if (!/^pi_[A-Za-z0-9]+$/.test(String(id || ''))) throw new Error('PaymentIntent inválido.');
  return chamarStripe(`payment_intents/${encodeURIComponent(id)}`, {}, env);
}

/**
 * Lê um PaymentIntent JÁ CONSULTADO na API e diz se ele aprova o pedido `orderId`.
 * @returns {{ aprova: boolean, motivo?: string, valor?: number, sku?: string }}
 */
export function avaliarPaymentIntent(pi, orderId) {
  if (!pi || pi.object !== 'payment_intent') return { aprova: false, motivo: 'nao_e_payment_intent' };
  if (pi.metadata?.canal !== CANAL_CARTAO_SITE) return { aprova: false, motivo: 'outro_canal' };
  if (!orderId || pi.metadata?.orderId !== orderId) return { aprova: false, motivo: 'pedido_diferente' };
  if (pi.status !== 'succeeded') return { aprova: false, motivo: `status_${pi.status}` };
  if (String(pi.currency).toLowerCase() !== 'brl') return { aprova: false, motivo: 'moeda' };
  return { aprova: true, valor: (Number(pi.amount_received) || 0) / 100, sku: pi.metadata?.sku || '' };
}
