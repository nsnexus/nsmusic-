import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getInfinitePayCredentials,
  createInfinitePayCheckoutLink,
  checkInfinitePayPayment,
} from '@/lib/infinitepay';

describe('InfinitePay Integration', () => {
  const mockEnv = {
    INFINITEPAY_HANDLE: 'test-handle',
    INFINITEPAY_API_KEY: 'inchk_test_key_123',
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInfinitePayCredentials', () => {
    it('lê credenciais do env passado', () => {
      const creds = getInfinitePayCredentials(mockEnv);
      expect(creds.handle).toBe('test-handle');
      expect(creds.apiKey).toBe('inchk_test_key_123');
    });

    it('faz fallback para process.env quando env está vazio', () => {
      process.env.INFINITEPAY_HANDLE = 'proc-handle';
      process.env.INFINITEPAY_API_KEY = 'inchk_proc_key';

      const creds = getInfinitePayCredentials({});
      expect(creds.handle).toBe('proc-handle');
      expect(creds.apiKey).toBe('inchk_proc_key');

      delete process.env.INFINITEPAY_HANDLE;
      delete process.env.INFINITEPAY_API_KEY;
    });
  });

  describe('createInfinitePayCheckoutLink', () => {
    it('cria link com preço em centavos e extrai slug corretamente', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          url: 'https://checkout.infinitepay.io/test-handle/ABC123XYZ',
        }),
      });

      const result = await createInfinitePayCheckoutLink(
        {
          orderId: 'ORDER-999',
          sku: 'combo',
          amount: 16.89,
          customerName: 'Cliente Teste',
          customerPhone: '11999998888',
          customerEmail: 'cliente@teste.com',
        },
        mockEnv
      );

      expect(result.ok).toBe(true);
      expect(result.url).toBe('https://checkout.infinitepay.io/test-handle/ABC123XYZ');
      expect(result.slug).toBe('ABC123XYZ');
      expect(result.orderNsu).toBe('ORDER-999');
      expect(result.amount).toBe(16.89);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.checkout.infinitepay.io/links');
      expect(options.headers['X-Api-Key']).toBe('inchk_test_key_123');

      const body = JSON.parse(options.body);
      expect(body.handle).toBe('test-handle');
      expect(body.order_nsu).toBe('ORDER-999');
      expect(body.items[0].price).toBe(1689); // 16.89 * 100
      expect(body.customer.name).toBe('Cliente Teste');
      expect(body.customer.phone_number).toBe('+5511999998888');
      expect(body.customer.email).toBe('cliente@teste.com');
    });

    it('lança erro se orderId ou amount forem inválidos', async () => {
      await expect(
        createInfinitePayCheckoutLink({ orderId: '', amount: 10 }, mockEnv)
      ).rejects.toThrow('orderId é obrigatório');

      await expect(
        createInfinitePayCheckoutLink({ orderId: 'ORD-1', amount: 0 }, mockEnv)
      ).rejects.toThrow('Valor inválido');
    });

    it('lança erro se a API responder com status de erro', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid payload',
      });

      await expect(
        createInfinitePayCheckoutLink(
          { orderId: 'ORD-1', amount: 9.99 },
          mockEnv
        )
      ).rejects.toThrow('InfinitePay API respondeu status 400');
    });
  });

  describe('checkInfinitePayPayment', () => {
    it('consulta /payment_check e converte centavos para reais', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          paid: true,
          paid_amount: 1689,
          capture_method: 'credit_card',
          installments: 1,
        }),
      });

      const res = await checkInfinitePayPayment(
        {
          orderNsu: 'ORDER-999',
          slug: 'ABC123XYZ',
          transactionNsu: 'tx-123',
        },
        mockEnv
      );

      expect(res.ok).toBe(true);
      expect(res.paid).toBe(true);
      expect(res.paidAmount).toBe(16.89);
      expect(res.captureMethod).toBe('credit_card');

      const [url, options] = global.fetch.mock.calls[0];
      expect(url).toBe('https://api.checkout.infinitepay.io/payment_check');
      const body = JSON.parse(options.body);
      expect(body.slug).toBe('ABC123XYZ');
      expect(body.order_nsu).toBe('ORDER-999');
      expect(body.transaction_nsu).toBe('tx-123');
    });
  });
});

