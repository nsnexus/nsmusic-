import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackGooglePurchase, GOOGLE_ADS_ID, GOOGLE_PURCHASE_CONVERSION_LABEL } from '@/lib/googleAds';

describe('googleAds module', () => {
  let storageMock = {};

  beforeEach(() => {
    storageMock = {};
    global.localStorage = {
      getItem: vi.fn((key) => storageMock[key] || null),
      setItem: vi.fn((key, val) => { storageMock[key] = String(val); }),
      removeItem: vi.fn((key) => { delete storageMock[key]; }),
    };
    global.window = {
      gtag: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exporta constantes corretas do Google Ads', () => {
    expect(GOOGLE_ADS_ID).toBe('AW-18489833665');
    expect(GOOGLE_PURCHASE_CONVERSION_LABEL).toBe('AW-18489833665/CBmtCMzoiZIdEMHx0fBE');
  });

  it('dispara evento de conversão de Compra no gtag', () => {
    trackGooglePurchase({ orderId: 'test-123', value: 16.89 });

    expect(global.window.gtag).toHaveBeenCalledTimes(1);
    expect(global.window.gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18489833665/CBmtCMzoiZIdEMHx0fBE',
      value: 16.89,
      currency: 'BRL',
      transaction_id: 'test-123',
    });
  });

  it('evita disparos duplicados para o mesmo orderId (desduplicação por localStorage)', () => {
    trackGooglePurchase({ orderId: 'dup-456', value: 9.99 });
    expect(global.window.gtag).toHaveBeenCalledTimes(1);

    // Segundo disparo para o mesmo orderId
    trackGooglePurchase({ orderId: 'dup-456', value: 9.99 });
    expect(global.window.gtag).toHaveBeenCalledTimes(1);
  });

  it('usa valor padrão 9.99 se valor não for informado', () => {
    trackGooglePurchase({ orderId: 'default-val' });

    expect(global.window.gtag).toHaveBeenCalledWith('event', 'conversion', {
      send_to: 'AW-18489833665/CBmtCMzoiZIdEMHx0fBE',
      value: 9.99,
      currency: 'BRL',
      transaction_id: 'default-val',
    });
  });
});
