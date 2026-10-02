import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  identifyTrafficSource,
  getOrderPlatform,
  calcularFaturamentoPedido,
  calcularMetricasPorPlataforma,
  TRAFFIC_STORAGE_KEY,
} from '../../src/lib/trafficSource.js';

describe('trafficSource module', () => {
  let localStorageMock = {};
  let sessionStorageMock = {};

  beforeEach(() => {
    localStorageMock = {};
    sessionStorageMock = {};

    global.localStorage = {
      getItem: vi.fn((key) => localStorageMock[key] || null),
      setItem: vi.fn((key, val) => { localStorageMock[key] = String(val); }),
      removeItem: vi.fn((key) => { delete localStorageMock[key]; }),
    };

    global.sessionStorage = {
      getItem: vi.fn((key) => sessionStorageMock[key] || null),
      setItem: vi.fn((key, val) => { sessionStorageMock[key] = String(val); }),
      removeItem: vi.fn((key) => { delete sessionStorageMock[key]; }),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getOrderPlatform', () => {
    it('deve priorizar trafficSource explícito', () => {
      expect(getOrderPlatform({ trafficSource: 'tiktok_ads' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ trafficSource: 'facebook_ads' })).toBe('facebook_ads');
      expect(getOrderPlatform({ trafficSource: 'organico' })).toBe('organico');
      expect(getOrderPlatform({ trafficSource: 'direto' })).toBe('direto');
    });

    it('deve identificar tiktok por ttclid ou utmSource', () => {
      expect(getOrderPlatform({ ttclid: 'tt-12345' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ utmSource: 'tiktok' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ utmSource: 'tiktok_ads' })).toBe('tiktok_ads');
    });

    it('deve identificar facebook por fbclid ou utmSource', () => {
      expect(getOrderPlatform({ fbclid: 'fb-12345' })).toBe('facebook_ads');
      expect(getOrderPlatform({ utmSource: 'facebook' })).toBe('facebook_ads');
      expect(getOrderPlatform({ utmSource: 'instagram' })).toBe('facebook_ads');
      expect(getOrderPlatform({ utmSource: 'meta' })).toBe('facebook_ads');
    });

    it('deve identificar google por gclid ou utmSource', () => {
      expect(getOrderPlatform({ gclid: 'g-12345' })).toBe('google_ads');
      expect(getOrderPlatform({ utmSource: 'google' })).toBe('google_ads');
    });

    it('deve atribuir pedidos anteriores (sem tracking) para facebook_ads conforme diretriz do usuário', () => {
      expect(getOrderPlatform({})).toBe('facebook_ads');
      expect(getOrderPlatform({ orderNumber: 'NS-123' })).toBe('facebook_ads');
    });
  });

  describe('calcularFaturamentoPedido', () => {
    it('calcula música com paidAmount explícito', () => {
      const order = { paymentStatus: 'PAGO', paidAmount: 16.89 };
      expect(calcularFaturamentoPedido(order)).toBe(16.89);
    });

    it('calcula música com fallback de R$ 9,99 se sem paidAmount', () => {
      const order = { paymentStatus: 'PAGAMENTO_APROVADO' };
      expect(calcularFaturamentoPedido(order)).toBe(9.99);
    });

    it('soma add-on avulso se houver id de transação de add-on', () => {
      const order = {
        paymentStatus: 'PAGO',
        paidAmount: 9.99,
        videoPaymentId: 'pay_video_1',
        videoAddonPaid: true,
        videoPaidAmount: 6.90,
      };
      expect(calcularFaturamentoPedido(order)).toBeCloseTo(16.89);
    });

    it('retorna 0 para pedido não pago', () => {
      const order = { paymentStatus: 'AGUARDANDO_PAGAMENTO' };
      expect(calcularFaturamentoPedido(order)).toBe(0);
    });
  });

  describe('calcularMetricasPorPlataforma', () => {
    it('agrupa faturamento e pedidos corretamente por plataforma', () => {
      const pedidos = [
        // 2 pedidos do Facebook Ads
        { id: '1', paymentStatus: 'PAGO', paidAmount: 9.99, trafficSource: 'facebook_ads' },
        { id: '2', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads' },
        // 1 pedido do TikTok Ads
        { id: '3', paymentStatus: 'PAGO', paidAmount: 16.89, trafficSource: 'tiktok_ads' },
        // 1 pedido anterior sem trafficSource (deve cair em facebook_ads)
        { id: '4', paymentStatus: 'PAGO', paidAmount: 9.99 },
      ];

      const res = calcularMetricasPorPlataforma(pedidos);

      const fb = res.plataformas.find((p) => p.key === 'facebook_ads');
      const tt = res.plataformas.find((p) => p.key === 'tiktok_ads');

      expect(fb.pedidosCriados).toBe(3); // 2 explícitos + 1 legado
      expect(fb.pedidosPagos).toBe(2);
      expect(fb.faturamento).toBeCloseTo(19.98);

      expect(tt.pedidosCriados).toBe(1);
      expect(tt.pedidosPagos).toBe(1);
      expect(tt.faturamento).toBeCloseTo(16.89);

      expect(res.totais.pedidosCriados).toBe(4);
      expect(res.totais.pedidosPagos).toBe(3);
      expect(res.totais.faturamento).toBeCloseTo(36.87);
    });
  });
});
