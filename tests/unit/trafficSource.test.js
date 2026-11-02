import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  identifyTrafficSource,
  getOrderPlatform,
  calcularFaturamentoPedido,
  calcularMetricasPorPlataforma,
  isOrderFromMeta,
  isOrderFromTikTok,
  TRAFFIC_STORAGE_KEY,
  getComparablePhone,
  arePhonesMatching,
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
      expect(getOrderPlatform({ utmSource: 'tt' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ utmCampaign: 'campanha_tiktok_2026' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ referrer: 'https://www.tiktok.com/' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ trafficSource: 'direto', ttclid: 'tt-abc' })).toBe('tiktok_ads');
      expect(getOrderPlatform({ trafficSource: 'direto', utmCampaign: 'tiktok_ads_01' })).toBe('tiktok_ads');
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

    it('filtra corretamente por dia específico quando informado diaFiltro', () => {
      // 1 pedido dia 03 (pago)
      // 1 pedido dia 03 (pendente)
      // 1 pedido dia 02 (pago)
      const pedidos = [
        {
          id: '1',
          paymentStatus: 'PAGO',
          paidAmount: 9.99,
          trafficSource: 'facebook_ads',
          createdAt: '2026-10-03T14:00:00.000Z',
          paidAt: '2026-10-03T14:10:00.000Z',
        },
        {
          id: '2',
          paymentStatus: 'AGUARDANDO_PAGAMENTO',
          trafficSource: 'tiktok_ads',
          createdAt: '2026-10-03T15:00:00.000Z',
        },
        {
          id: '3',
          paymentStatus: 'PAGO',
          paidAmount: 16.89,
          trafficSource: 'tiktok_ads',
          createdAt: '2026-10-02T10:00:00.000Z',
          paidAt: '2026-10-02T10:05:00.000Z',
        },
      ];

      // Filtrando dia 3
      const resDia3 = calcularMetricasPorPlataforma(pedidos, 3, '2026-10');
      const fbDia3 = resDia3.plataformas.find((p) => p.key === 'facebook_ads');
      const ttDia3 = resDia3.plataformas.find((p) => p.key === 'tiktok_ads');

      expect(fbDia3.pedidosCriados).toBe(1);
      expect(fbDia3.pedidosPagos).toBe(1);
      expect(fbDia3.faturamento).toBeCloseTo(9.99);

      expect(ttDia3.pedidosCriados).toBe(1);
      expect(ttDia3.pedidosPagos).toBe(0);
      expect(ttDia3.faturamento).toBe(0);

      expect(resDia3.totais.pedidosCriados).toBe(2);
      expect(resDia3.totais.pedidosPagos).toBe(1);
      expect(resDia3.totais.faturamento).toBeCloseTo(9.99);

      // Filtrando dia 2
      const resDia2 = calcularMetricasPorPlataforma(pedidos, 2, '2026-10');
      const ttDia2 = resDia2.plataformas.find((p) => p.key === 'tiktok_ads');
      expect(ttDia2.pedidosCriados).toBe(1);
      expect(ttDia2.pedidosPagos).toBe(1);
      expect(ttDia2.faturamento).toBeCloseTo(16.89);
      expect(resDia2.totais.faturamento).toBeCloseTo(16.89);
    });

    it('calcula percentual de conversão em cima do total de pedidos com música gerada (não meros acessos/etapas)', () => {
      const pedidos = [
        // 10 pedidos iniciados no Facebook Ads, mas apenas 2 geraram música e 1 pagou
        { id: 'fb-pago', paymentStatus: 'PAGO', paidAmount: 9.99, trafficSource: 'facebook_ads', productionStatus: 'AUDIO_GERADO' },
        { id: 'fb-musica-nao-paga', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads', productionStatus: 'AUDIO_GERADO', audioUrl: 'https://cdn/preview.mp3' },
        // 8 rascunhos que pararam nas etapas de formulário (acessos/leads)
        { id: 'fb-draft-1', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads', productionStatus: 'ETAPA_1' },
        { id: 'fb-draft-2', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads', productionStatus: 'ETAPA_2' },
        { id: 'fb-draft-3', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads', productionStatus: 'ETAPA_3' },
        { id: 'fb-draft-4', paymentStatus: 'AGUARDANDO_PAGAMENTO', trafficSource: 'facebook_ads', productionStatus: 'ETAPA_4' },
      ];

      const res = calcularMetricasPorPlataforma(pedidos);
      const fb = res.plataformas.find((p) => p.key === 'facebook_ads');

      expect(fb.pedidosCriados).toBe(6);
      expect(fb.musicasGeradas).toBe(2);
      expect(fb.pedidosPagos).toBe(1);
      // Conversão deve ser 1 pago / 2 músicas geradas = 50%, NÃO 1 / 6 (16.7%)
      expect(fb.conversao).toBe(50);
      expect(res.totais.musicasGeradas).toBe(2);
      expect(res.totais.conversaoGeral).toBe(50);
    });
  });

  describe('isOrderFromMeta', () => {
    it('retorna true para pedido com fbclid', () => {
      expect(isOrderFromMeta({ fbclid: 'fb-xyz-123' })).toBe(true);
      expect(isOrderFromMeta({ extras: { fbclid: 'fb-xyz-123' } })).toBe(true);
    });

    it('retorna true para pedido com UTM de Meta/Instagram/Facebook', () => {
      expect(isOrderFromMeta({ utmSource: 'ig' })).toBe(true);
      expect(isOrderFromMeta({ utmSource: 'fb' })).toBe(true);
      expect(isOrderFromMeta({ utmSource: 'facebook' })).toBe(true);
      expect(isOrderFromMeta({ utmSource: 'instagram' })).toBe(true);
      expect(isOrderFromMeta({ utmCampaign: 'NSMusic' })).toBe(true);
      expect(isOrderFromMeta({ extras: { utmSource: 'ig', utmCampaign: 'NSMusic' } })).toBe(true);
    });

    it('retorna true para pedido com trafficSource explicitamente facebook_ads', () => {
      expect(isOrderFromMeta({ trafficSource: 'facebook_ads' })).toBe(true);
      expect(isOrderFromMeta({ platform: 'facebook_ads' })).toBe(true);
    });

    it('retorna false para pedidos vindos do TikTok Ads', () => {
      expect(isOrderFromMeta({ ttclid: 'tt-123' })).toBe(false);
      expect(isOrderFromMeta({ utmSource: 'tiktok' })).toBe(false);
      expect(isOrderFromMeta({ trafficSource: 'tiktok_ads' })).toBe(false);
      expect(isOrderFromMeta({ ttclid: 'tt-123', utmCampaign: 'NSMusic' })).toBe(false);
    });

    it('retorna false para pedidos vindos do Google Ads', () => {
      expect(isOrderFromMeta({ gclid: 'g-123' })).toBe(false);
      expect(isOrderFromMeta({ utmSource: 'google' })).toBe(false);
    });

    it('retorna false para pedidos diretos ou nulos', () => {
      expect(isOrderFromMeta(null)).toBe(false);
      expect(isOrderFromMeta(undefined)).toBe(false);
      expect(isOrderFromMeta({})).toBe(false);
      expect(isOrderFromMeta({ trafficSource: 'direto' })).toBe(false);
      expect(isOrderFromMeta({ trafficSource: 'organico' })).toBe(false);
    });
  });

  describe('isOrderFromTikTok', () => {
    it('retorna true para pedido com ttclid', () => {
      expect(isOrderFromTikTok({ ttclid: 'tt-abc-999' })).toBe(true);
      expect(isOrderFromTikTok({ extras: { ttclid: 'tt-abc-999' } })).toBe(true);
    });

    it('retorna true para pedido com UTM de TikTok', () => {
      expect(isOrderFromTikTok({ utmSource: 'tiktok' })).toBe(true);
      expect(isOrderFromTikTok({ utmSource: 'tt' })).toBe(true);
      expect(isOrderFromTikTok({ utmCampaign: 'Website conversion 20260930' })).toBe(false);
      expect(isOrderFromTikTok({ utmSource: 'tiktok', utmCampaign: 'Website conversion 20260930' })).toBe(true);
      expect(isOrderFromTikTok({ utmCampaign: 'tiktok_promo_01' })).toBe(true);
      expect(isOrderFromTikTok({ referrer: 'https://www.tiktok.com/@user' })).toBe(true);
    });

    it('retorna true para pedido com trafficSource explicitamente tiktok_ads', () => {
      expect(isOrderFromTikTok({ trafficSource: 'tiktok_ads' })).toBe(true);
      expect(isOrderFromTikTok({ platform: 'tiktok_ads' })).toBe(true);
    });

    it('retorna false para pedidos vindos de Meta Ads', () => {
      expect(isOrderFromTikTok({ fbclid: 'fb-123' })).toBe(false);
      expect(isOrderFromTikTok({ utmSource: 'facebook' })).toBe(false);
      expect(isOrderFromTikTok({ utmSource: 'ig' })).toBe(false);
      expect(isOrderFromTikTok({ trafficSource: 'facebook_ads' })).toBe(false);
    });

    it('retorna false para pedidos diretos ou nulos', () => {
      expect(isOrderFromTikTok(null)).toBe(false);
      expect(isOrderFromTikTok(undefined)).toBe(false);
      expect(isOrderFromTikTok({})).toBe(false);
      expect(isOrderFromTikTok({ trafficSource: 'direto' })).toBe(false);
      expect(isOrderFromTikTok({ trafficSource: 'organico' })).toBe(false);
    });

    it('retorna true quando o pedido herda tiktok_ads via allOrders (parentOrderId ou telefone)', () => {
      const order1 = { id: 'p1', customerPhone: '(11) 98888-7777', trafficSource: 'tiktok_ads', ttclid: 'tt-123' };
      const order2 = { id: 'p2', customerPhone: '11988887777', trafficSource: 'direto' };
      expect(isOrderFromTikTok(order2, [order1, order2])).toBe(true);

      const orderChild = { id: 'p3', parentOrderId: 'p1', trafficSource: 'direto' };
      expect(isOrderFromTikTok(orderChild, [order1, orderChild])).toBe(true);
    });
  });

  describe('Atribuição Herdada e Multi-toque (getOrderPlatform com allOrders)', () => {
    it('herda tiktok_ads do pedido pai via parentOrderId', () => {
      const parent = { id: 'ord_parent_1', trafficSource: 'tiktok_ads', ttclid: 'tt-parent-123' };
      const child = { id: 'ord_child_1', parentOrderId: 'ord_parent_1', trafficSource: 'direto' };

      expect(getOrderPlatform(child, [parent, child])).toBe('tiktok_ads');
    });

    it('herda tiktok_ads por correspondência de telefone do cliente', () => {
      const order1 = { id: 'ord_tt', customerPhone: '(98) 99126-6474', trafficSource: 'tiktok_ads' };
      const order2 = { id: 'ord_dir', customerPhone: '5598991266474', trafficSource: 'direto' };

      expect(getOrderPlatform(order2, [order1, order2])).toBe('tiktok_ads');
    });

    it('herda meta_ads por correspondência de email do cliente', () => {
      const order1 = { id: 'ord_meta', customerEmail: 'cliente@exemplo.com', trafficSource: 'facebook_ads' };
      const order2 = { id: 'ord_dir', customerEmail: 'cliente@exemplo.com', trafficSource: 'direto' };

      expect(getOrderPlatform(order2, [order1, order2])).toBe('facebook_ads');
    });

    it('mantém direto quando não há nenhum vínculo prévio com campanha paga', () => {
      const orderDirect = { id: 'ord_solo', customerPhone: '11977776666', trafficSource: 'direto' };
      expect(getOrderPlatform(orderDirect, [orderDirect])).toBe('direto');
    });
  });

  describe('Normalização de Telefone (getComparablePhone & arePhonesMatching)', () => {
    it('normaliza formatos brasileiros com e sem DDI 55', () => {
      expect(getComparablePhone('(98) 99126-6474')).toBe('98991266474');
      expect(getComparablePhone('5598991266474')).toBe('98991266474');
      expect(getComparablePhone('+55 (98) 99126-6474')).toBe('98991266474');
      expect(getComparablePhone('')).toBe('');
    });

    it('reconhece correspondência entre formatos de telefone', () => {
      expect(arePhonesMatching('(98) 99126-6474', '5598991266474')).toBe(true);
      expect(arePhonesMatching('98991266474', '98991266474')).toBe(true);
      expect(arePhonesMatching('98991266474', '11999998888')).toBe(false);
    });
  });

  describe('Janela de Atribuição Paga de 30 dias (identifyTrafficSource)', () => {
    it('preserva atribuição paga se cliente navega direto sem novos parâmetros de anúncio', () => {
      const savedPaidTraffic = {
        platform: 'tiktok_ads',
        trafficSource: 'tiktok_ads',
        ttclid: 'tt-stored-999',
        capturedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 dias atrás
      };
      localStorageMock[TRAFFIC_STORAGE_KEY] = JSON.stringify(savedPaidTraffic);

      vi.stubGlobal('window', {
        location: {
          search: '',
          hostname: 'nsmusic.nsnexus.com.br',
        },
      });
      vi.stubGlobal('document', { referrer: '' });

      const res = identifyTrafficSource();
      expect(res.platform).toBe('tiktok_ads');
      expect(res.ttclid).toBe('tt-stored-999');
    });

    it('preserva atribuição paga se visitante chega via link do WhatsApp sem parâmetros de anúncio pago', () => {
      const savedPaidTraffic = {
        platform: 'tiktok_ads',
        trafficSource: 'tiktok_ads',
        ttclid: 'tt-stored-999',
        capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };
      localStorageMock[TRAFFIC_STORAGE_KEY] = JSON.stringify(savedPaidTraffic);

      vi.stubGlobal('window', {
        location: {
          search: '?utm_source=whatsapp&utm_medium=notificacao',
          hostname: 'nsmusic.nsnexus.com.br',
        },
      });
      vi.stubGlobal('document', { referrer: 'android-app://com.whatsapp/' });

      const res = identifyTrafficSource();
      expect(res.platform).toBe('tiktok_ads');
      expect(res.ttclid).toBe('tt-stored-999');
    });

    it('substitui atribuição se visitante clica em novo anúncio explícito do Meta (fbclid)', () => {
      const savedPaidTraffic = {
        platform: 'tiktok_ads',
        trafficSource: 'tiktok_ads',
        ttclid: 'tt-stored-999',
        capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };
      localStorageMock[TRAFFIC_STORAGE_KEY] = JSON.stringify(savedPaidTraffic);

      vi.stubGlobal('window', {
        location: {
          search: '?fbclid=fb-novo-clique-123&utm_source=facebook',
          hostname: 'nsmusic.nsnexus.com.br',
        },
      });
      vi.stubGlobal('document', { referrer: 'https://l.facebook.com/' });

      const res = identifyTrafficSource();
      expect(res.platform).toBe('facebook_ads');
      expect(res.fbclid).toBe('fb-novo-clique-123');
    });
  });

  describe('calcularMetricasPorPlataforma com Herança', () => {
    it('atribui receita de 2ª versão direta ao TikTok Ads quando o cliente veio do TikTok', () => {
      const pedidos = [
        // Versão 1: gerada via TikTok Ads, mas o cliente não gostou e não pagou
        {
          id: 'v1',
          customerPhone: '(98) 99126-6474',
          trafficSource: 'tiktok_ads',
          ttclid: 'tt-123',
          paymentStatus: 'AGUARDANDO_PAGAMENTO',
          paidAmount: 0,
          createdAt: '2026-11-01T10:00:00Z',
        },
        // Versão 2: cliente criou outra sem UTMs na URL, gostou e pagou R$ 9.99
        {
          id: 'v2',
          customerPhone: '5598991266474',
          trafficSource: 'direto',
          paymentStatus: 'PAGAMENTO_APROVADO',
          paidAmount: 9.99,
          createdAt: '2026-11-01T10:15:00Z',
          paidAt: '2026-11-01T10:20:00Z',
        },
        // Pedido verdadeiramente direto de outro cliente
        {
          id: 'v3',
          customerPhone: '11977778888',
          trafficSource: 'direto',
          paymentStatus: 'PAGAMENTO_APROVADO',
          paidAmount: 9.99,
          createdAt: '2026-11-01T11:00:00Z',
          paidAt: '2026-11-01T11:05:00Z',
        },
      ];

      const res = calcularMetricasPorPlataforma(pedidos);
      const tt = res.plataformas.find((p) => p.key === 'tiktok_ads');
      const dir = res.plataformas.find((p) => p.key === 'direto');

      // TikTok deve ter 1 pedido pago e R$ 9.99 de faturamento!
      expect(tt.pedidosPagos).toBe(1);
      expect(tt.faturamento).toBeCloseTo(9.99);

      // Direto deve ter apenas 1 pedido pago (v3, o verdadeiramente sem vínculo)
      expect(dir.pedidosPagos).toBe(1);
      expect(dir.faturamento).toBeCloseTo(9.99);
    });
  });
});
