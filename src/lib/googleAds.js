// src/lib/googleAds.js
// Rastreamento de conversões do Google Ads
// ID da Tag: AW-18489833665

export const GOOGLE_ADS_ID = 'AW-18489833665';
export const GOOGLE_PURCHASE_CONVERSION_LABEL = 'AW-18489833665/CBmtCMzoiZIdEMHx0fBE';

/**
 * Dispara evento de conversão de Compra no Google Ads
 * Protegido com desduplicação por orderId via localStorage.
 * @param {Object} params
 * @param {string|number} params.orderId - ID do pedido para desduplicação
 * @param {number} [params.value] - Valor da transação em BRL
 */
export function trackGooglePurchase({ orderId, value = 9.99 } = {}) {
  if (typeof window === 'undefined') return;

  const storageKey = orderId ? `gads_purchase_${orderId}` : null;
  try {
    if (storageKey && localStorage.getItem(storageKey)) {
      return; // Já disparado para este pedido
    }
    if (storageKey) {
      localStorage.setItem(storageKey, '1');
    }
  } catch (e) {}

  if (typeof window.gtag === 'function') {
    window.gtag('event', 'conversion', {
      send_to: GOOGLE_PURCHASE_CONVERSION_LABEL,
      value: Number(value) || 9.99,
      currency: 'BRL',
      transaction_id: String(orderId || ''),
    });
  }
}
