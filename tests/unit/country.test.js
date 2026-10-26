import { describe, it, expect } from 'vitest';
import { isUSOrder, getOrderCountryInfo } from '@/lib/country.js';

describe('country.js - Detecção e filtros de pedidos por país', () => {
  describe('isUSOrder', () => {
    it('retorna false para inputs nulos, indefinidos ou inválidos', () => {
      expect(isUSOrder(null)).toBe(false);
      expect(isUSOrder(undefined)).toBe(false);
      expect(isUSOrder('not-an-object')).toBe(false);
      expect(isUSOrder({})).toBe(false);
    });

    it('detecta pedido brasileiro padrão como não-US', () => {
      const brOrder = {
        id: 'ord-123',
        orderNumber: '1725890001',
        country: 'BR',
        currency: 'BRL',
        paymentStatus: 'PAGAMENTO_APROVADO',
      };
      expect(isUSOrder(brOrder)).toBe(false);
    });

    it('detecta US pelo campo country', () => {
      expect(isUSOrder({ country: 'US' })).toBe(true);
      expect(isUSOrder({ extras: { country: 'US' } })).toBe(true);
    });

    it('detecta US pelo campo currency (USD/usd)', () => {
      expect(isUSOrder({ currency: 'USD' })).toBe(true);
      expect(isUSOrder({ currency: 'usd' })).toBe(true);
      expect(isUSOrder({ extras: { currency: 'usd' } })).toBe(true);
      expect(isUSOrder({ extras: { currency: 'USD' } })).toBe(true);
    });

    it('detecta US pelos metadados da plataforma nsmusic-us (extras.us.market)', () => {
      const usOrder = {
        id: 'ord-us-1',
        extras: {
          us: {
            market: 'US',
            sku: 'audio_only',
          },
        },
      };
      expect(isUSOrder(usOrder)).toBe(true);
    });

    it('detecta US pelo SKU americano (usPackageSku)', () => {
      expect(isUSOrder({ usPackageSku: 'combo' })).toBe(true);
      expect(isUSOrder({ extras: { usPackageSku: 'combo_carta' } })).toBe(true);
    });

    it('detecta US pelo prefixo US- no orderNumber ou order_number', () => {
      expect(isUSOrder({ orderNumber: 'US-98421A' })).toBe(true);
      expect(isUSOrder({ order_number: 'us-7749' })).toBe(true);
      expect(isUSOrder({ orderNumber: '17259000' })).toBe(false);
    });
  });

  describe('getOrderCountryInfo', () => {
    it('retorna informações corretas para pedido dos Estados Unidos', () => {
      const usOrder = { orderNumber: 'US-1029', currency: 'usd' };
      const info = getOrderCountryInfo(usOrder);
      expect(info.code).toBe('US');
      expect(info.name).toBe('Estados Unidos');
      expect(info.flag).toBe('🇺🇸');
      expect(info.currency).toBe('USD');
      expect(info.symbol).toBe('$');
      expect(info.badgeLabel).toBe('🇺🇸 EUA');
    });

    it('retorna informações corretas para pedido do Brasil', () => {
      const brOrder = { orderNumber: '1725890001' };
      const info = getOrderCountryInfo(brOrder);
      expect(info.code).toBe('BR');
      expect(info.name).toBe('Brasil');
      expect(info.flag).toBe('🇧🇷');
      expect(info.currency).toBe('BRL');
      expect(info.symbol).toBe('R$');
      expect(info.badgeLabel).toBe('🇧🇷 BR');
    });
  });
});
