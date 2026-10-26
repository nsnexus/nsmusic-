/**
 * Utilitários para detecção e diferenciação de pedidos por país / mercado.
 * - Brasil (BR): plataforma principal (nsmusic.ia.br / nsmusic.com.br)
 * - Estados Unidos (US): plataforma americana (us.nsmusic.ia.br)
 */

/**
 * Detecta se o pedido pertence à plataforma dos Estados Unidos (US)
 * @param {Object} order - Objeto do pedido (Supabase / Firestore format)
 * @returns {boolean}
 */
export function isUSOrder(order) {
  if (!order || typeof order !== 'object') return false;

  // 1. Verificação explícita por país ou moeda
  if (order.country === 'US' || order.extras?.country === 'US') return true;
  if (order.currency === 'USD' || order.currency === 'usd') return true;
  if (order.extras?.currency === 'USD' || order.extras?.currency === 'usd') return true;

  // 2. Metadados específicos do mercado americano gravados por nsmusic-us
  if (order.extras?.us?.market === 'US') return true;
  if (order.extras?.usPackageSku || order.usPackageSku) return true;

  // 3. Padrão do código do pedido (US-XXXXX)
  const orderNumber = String(order.orderNumber || order.order_number || '');
  if (orderNumber.toUpperCase().startsWith('US-')) return true;

  return false;
}

/**
 * Retorna as informações formatadas do país e moeda do pedido
 * @param {Object} order
 * @returns {{ code: 'US' | 'BR', name: string, flag: string, currency: 'USD' | 'BRL', symbol: string, badgeLabel: string }}
 */
export function getOrderCountryInfo(order) {
  if (isUSOrder(order)) {
    return {
      code: 'US',
      name: 'Estados Unidos',
      flag: '🇺🇸',
      currency: 'USD',
      symbol: '$',
      badgeLabel: '🇺🇸 EUA',
    };
  }

  return {
    code: 'BR',
    name: 'Brasil',
    flag: '🇧🇷',
    currency: 'BRL',
    symbol: 'R$',
    badgeLabel: '🇧🇷 BR',
  };
}
