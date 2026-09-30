// TikTok Events API (Server-side) — envia o evento de CompletePayment direto do servidor,
// no único ponto de aprovação de pagamento (src/lib/payments.js:applyPaymentApproval).
// Garante 100% de precisão na atribuição de compras do TikTok Ads, sem depender de o cliente
// manter o navegador aberto após pagar no aplicativo do banco.

import { resolverSiteUrl } from './siteUrl.js';

export const TIKTOK_PIXEL_ID = 'DAUEUPJC77U5PB60GKDG';
const TIKTOK_EVENTS_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

async function sha256Hex(text) {
  if (!text) return null;
  const clean = String(text).trim().toLowerCase();
  const data = new TextEncoder().encode(clean);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhoneForMatching(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  // Telefones no Brasil com 10 ou 11 dígitos (DDD + número) — formato E.164 com +55
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return `+${digits}`;
}

function normalizeEmailForMatching(email) {
  const trimmed = String(email || '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

/**
 * Envia um evento de CompletePayment (Purchase) para a Events API do TikTok.
 * @param {{orderId: string, value: number, contentName: string, sku?: string, customerPhone?: string, customerEmail?: string}} params
 * @param {object} env contexto de ambiente resolvido pela rota chamadora (Cloudflare Pages)
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendTikTokPurchaseEvent({ orderId, value, contentName, sku, customerPhone, customerEmail }, env) {
  const accessToken = readEnvValue(env, 'TIKTOK_EVENTS_API_ACCESS_TOKEN');
  if (!accessToken) {
    console.warn('[tiktok-capi] TIKTOK_EVENTS_API_ACCESS_TOKEN não configurado — evento de CompletePayment não enviado.');
    return { sent: false, reason: 'no_token' };
  }
  if (typeof value !== 'number' || value <= 0) {
    return { sent: false, reason: 'invalid_value' };
  }

  const userData = {};
  const normalizedPhone = normalizePhoneForMatching(customerPhone);
  const normalizedEmail = normalizeEmailForMatching(customerEmail);

  if (normalizedPhone) {
    const hashedPhone = await sha256Hex(normalizedPhone);
    if (hashedPhone) userData.phone = hashedPhone;
  }

  if (normalizedEmail) {
    const hashedEmail = await sha256Hex(normalizedEmail);
    if (hashedEmail) userData.email = hashedEmail;
  }

  if (orderId) {
    const hashedExtId = await sha256Hex(orderId);
    if (hashedExtId) userData.external_id = hashedExtId;
  }

  // Deduplicação estável por pedido e item
  const eventId = `purchase_${orderId}_${(sku || contentName || 'audio').replace(/\s+/g, '_').toLowerCase()}`;
  const siteUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));
  const eventSourceUrl = `${siteUrl}/entrega?id=${encodeURIComponent(orderId)}`;

  const payload = {
    event_source: 'web',
    event_source_id: TIKTOK_PIXEL_ID,
    data: [
      {
        event: 'CompletePayment',
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        user: userData,
        properties: {
          currency: 'BRL',
          value,
          contents: [
            {
              content_id: sku || 'audio_only',
              content_type: 'product',
              content_name: contentName || 'Música Personalizada com IA',
            },
          ],
        },
        page: {
          url: eventSourceUrl,
        },
      },
    ],
  };

  try {
    const res = await fetch(TIKTOK_EVENTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[tiktok-capi] Falha ao enviar evento (HTTP ${res.status}):`, errText.slice(0, 300));
      return { sent: false, reason: `http_${res.status}` };
    }

    const json = await res.json().catch(() => ({}));
    if (json.code !== 0) {
      console.warn('[tiktok-capi] Resposta com código de erro do TikTok:', json.code, json.message);
      return { sent: false, reason: json.message || `code_${json.code}` };
    }

    return { sent: true };
  } catch (err) {
    console.warn('[tiktok-capi] Erro de rede ao enviar evento:', err?.message);
    return { sent: false, reason: err?.name === 'TimeoutError' ? 'timeout' : 'network_error' };
  }
}
