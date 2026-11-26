import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cartão dentro do site (Stripe Payment Element): valor pelo catálogo, aprovação só com o
// PaymentIntent reconsultado na Stripe, e só para o canal do site (sem aprovar em dobro a Checkout).

const aprovar = vi.fn(async () => ({ applied: true }));
vi.mock('@/lib/payments', () => ({ applyPaymentApproval: (...a) => aprovar(...a) }));

import { valorDoCartao, avaliarPaymentIntent, criarPaymentIntentCartao, CANAL_CARTAO_SITE } from '@/lib/stripe';
import { getPriceForSku } from '@/lib/pricing';
import { POST as webhook } from '@/app/api/webhooks/stripe/route';

const ORDER = 'pedidoAbc123XYZ';
const pi = (extra = {}) => ({
  object: 'payment_intent', id: 'pi_123', status: 'succeeded', currency: 'brl', amount_received: 999,
  metadata: { orderId: ORDER, sku: 'audio_only', canal: CANAL_CARTAO_SITE }, ...extra,
});

describe('valorDoCartao', () => {
  it('usa o catálogo do servidor e recusa SKU desconhecido', () => {
    expect(valorDoCartao('audio_only', 0.01)).toEqual({ valor: getPriceForSku('audio_only') });
    expect(valorDoCartao('nao_existe').erro).toMatch(/SKU/);
  });

  it('impacto: piso no preço normal e teto fixo', () => {
    expect(valorDoCartao('impacto', 1).erro).toMatch(/mínimo/);
    expect(valorDoCartao('impacto', 5000).erro).toMatch(/alto/);
    expect(valorDoCartao('impacto', 25.555)).toEqual({ valor: 25.56 });
  });
});

describe('avaliarPaymentIntent', () => {
  it('aprova só PaymentIntent pago, do site, do mesmo pedido, em reais', () => {
    expect(avaliarPaymentIntent(pi(), ORDER)).toEqual({ aprova: true, valor: 9.99, sku: 'audio_only' });
    expect(avaliarPaymentIntent(pi(), 'outroPedido').motivo).toBe('pedido_diferente');
    expect(avaliarPaymentIntent(pi({ status: 'requires_payment_method' }), ORDER).aprova).toBe(false);
    expect(avaliarPaymentIntent(pi({ metadata: { orderId: ORDER } }), ORDER).motivo).toBe('outro_canal');
    expect(avaliarPaymentIntent(pi({ currency: 'usd' }), ORDER).motivo).toBe('moeda');
  });
});

describe('criarPaymentIntentCartao', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('manda valor em centavos, canal do site e chave de idempotência por pedido + SKU + valor', async () => {
    const f = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'pi_1', client_secret: 'pi_1_secret', status: 'requires_payment_method' }) }));
    vi.stubGlobal('fetch', f);
    await criarPaymentIntentCartao({ orderId: ORDER, sku: 'audio_only', valor: 9.99 }, { STRIPE_SECRET_KEY: 'sk_test_x' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/payment_intents');
    expect(init.headers['Idempotency-Key']).toBe(`nsm-cartao-${ORDER}-audio_only-999`);
    const form = new URLSearchParams(init.body);
    expect(form.get('amount')).toBe('999');
    expect(form.get('currency')).toBe('brl');
    expect(form.get('metadata[canal]')).toBe('site');
    expect(form.get('metadata[orderId]')).toBe(ORDER);
  });
});

async function assinar(corpo, segredo) {
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${corpo}`));
  return `t=${t},v1=${[...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

describe('webhook da Stripe: payment_intent.succeeded', () => {
  const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_teste' };
  beforeEach(() => {
    aprovar.mockClear();
    for (const [k, v] of Object.entries(env)) process.env[k] = v;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of Object.keys(env)) delete process.env[k];
  });

  const chamar = async (evento, piDaApi) => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => piDaApi })));
    const corpo = JSON.stringify(evento);
    const req = new Request('https://x/api/webhooks/stripe', { method: 'POST', body: corpo, headers: { 'stripe-signature': await assinar(corpo, env.STRIPE_WEBHOOK_SECRET) } });
    return webhook(req);
  };

  it('aprova o cartão do site depois de reconsultar o PaymentIntent', async () => {
    const res = await chamar({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: pi() } }, pi());
    expect(res.status).toBe(200);
    expect(aprovar).toHaveBeenCalledWith(ORDER, 'pi_123', expect.objectContaining({ status: 'approved', transaction_amount: 9.99, sku: 'audio_only' }), expect.anything());
  });

  it('ignora PaymentIntent da Stripe Checkout (sem canal do site): quem aprova é o checkout.session.completed', async () => {
    const semCanal = pi({ metadata: { orderId: ORDER } });
    await chamar({ id: 'evt_2', type: 'payment_intent.succeeded', data: { object: semCanal } }, semCanal);
    expect(aprovar).not.toHaveBeenCalled();
  });

  it('não aprova se a Stripe disser que não está pago', async () => {
    await chamar({ id: 'evt_3', type: 'payment_intent.succeeded', data: { object: pi() } }, pi({ status: 'requires_payment_method' }));
    expect(aprovar).not.toHaveBeenCalled();
  });

  it('estorno total revoga pelo caminho central', async () => {
    await chamar({ id: 'evt_4', type: 'charge.refunded', data: { object: { object: 'charge', refunded: true, payment_intent: 'pi_123' } } }, pi());
    expect(aprovar).toHaveBeenCalledWith(ORDER, 'pi_123', expect.objectContaining({ status: 'refunded' }), expect.anything());
  });
});
