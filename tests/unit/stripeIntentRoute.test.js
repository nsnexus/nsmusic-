import { describe, it, expect, vi, beforeEach } from 'vitest';

// Rota da cobrança no cartão: lê o pedido e cria a cobrança em paralelo; gravações em segundo plano.
const getOrder = vi.fn();
const updateOrder = vi.fn(async () => ({ success: true }));
vi.mock('@/lib/supabaseDb', () => ({ getOrder: (...a) => getOrder(...a), updateOrder: (...a) => updateOrder(...a) }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({ rpc: vi.fn(async () => ({ data: true, error: null })) }) }));
const criar = vi.fn(async () => ({ id: 'pi_1', client_secret: 'pi_1_secret', status: 'requires_payment_method' }));
const cancelar = vi.fn(async () => ({}));
vi.mock('@/lib/stripe', async (orig) => ({
  ...(await orig()),
  getStripeConfig: () => ({ secretKey: 'sk', publishableKey: 'pk' }),
  criarPaymentIntentCartao: (...a) => criar(...a),
  cancelarPaymentIntent: (...a) => cancelar(...a),
}));

const { POST } = await import('@/app/api/payments/stripe/intent/route');
const pedir = (body) => POST(new Request('https://x/api/payments/stripe/intent', { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => { getOrder.mockReset(); criar.mockClear(); cancelar.mockClear(); updateOrder.mockClear(); });

describe('POST /api/payments/stripe/intent', () => {
  it('devolve o client_secret com o valor do catálogo', async () => {
    getOrder.mockResolvedValue({ id: 'pedidoAbc123', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '94991234567' });
    const res = await pedir({ orderId: 'pedidoAbc123', sku: 'audio_only', amount: 0.01 });
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toMatchObject({ clientSecret: 'pi_1_secret', paymentIntentId: 'pi_1' });
    expect(data.amount).toBeGreaterThan(1);
    expect(criar.mock.calls[0][0].valor).toBe(data.amount);
  });

  it('pedido inexistente: 404 e a cobrança criada em paralelo é cancelada', async () => {
    getOrder.mockResolvedValue(null);
    const res = await pedir({ orderId: 'pedidoInexistente', sku: 'audio_only' });
    expect(res.status).toBe(404);
    await new Promise((r) => setTimeout(r, 0));
    expect(cancelar).toHaveBeenCalledWith('pi_1', expect.anything());
  });
});
