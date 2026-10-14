// Conversions API da Meta — envia o evento de Purchase direto do servidor, no único ponto de
// aprovação de pagamento (src/lib/payments.js:applyPaymentApproval). Substitui o fbq('track',
// 'Purchase', ...) que existia em entrega/page.jsx: aquele dependia de localStorage pra não contar a
// mesma venda duas vezes, e localStorage é por navegador — o link de entrega chega pelo WhatsApp, o
// cliente frequentemente reabre no navegador embutido do WhatsApp (contexto diferente de onde pagou),
// e cada reabertura sem o registro local disparava um Purchase novo pra Meta. Resultado real
// (14-19/08/2026): 25 vendas confirmadas no banco, 42 contadas no Pixel.
//
// Servidor não tem esse problema: dispara uma vez, no momento exato da aprovação, independente de
// quantos navegadores o cliente usa depois.

import { resolverSiteUrl } from './siteUrl.js';

export const META_PIXELS = [
  { id: '1366434898413500', tokenEnv: 'META_CAPI_ACCESS_TOKEN' },
  { id: '1450829683640531', tokenEnv: 'META_CAPI_ACCESS_TOKEN_2', fallbackTokenEnv: 'META_CAPI_ACCESS_TOKEN' },
];
export const META_PIXEL_ID = META_PIXELS[0].id;
const GRAPH_API_VERSION = 'v21.0';

function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text).trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalizePhoneForMatching(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  // Telefones no Brasil com 10 ou 11 dígitos (DDD + número) — a Meta exige DDI 55 em E.164
  if (digits.length === 10 || digits.length === 11) {
    return `55${digits}`;
  }
  return digits;
}

function normalizeEmailForMatching(email) {
  const trimmed = String(email || '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

/**
 * Envia um evento de Purchase pro Conversions API da Meta (para todos os pixels configurados).
 * @param {{orderId: string, value: number, contentName: string, customerPhone?: string, customerEmail?: string}} params
 * @param {object} env contexto de ambiente resolvido pela rota chamadora
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendMetaPurchaseEvent({ orderId, value, contentName = 'Música Homenagem Personalizada', eventId: customEventId, customerPhone, customerEmail }, env) {
  if (typeof value !== 'number' || value <= 0) {
    return { sent: false, reason: 'invalid_value' };
  }

  // Hasheado (SHA-256) — a Meta nunca recebe o telefone/e-mail em texto puro, só o hash pra
  // correspondência (ver .claude/rules/security.md — nunca logar PII; aqui nem chega a logar).
  const userData = {};
  const normalizedPhone = normalizePhoneForMatching(customerPhone);
  const normalizedEmail = normalizeEmailForMatching(customerEmail);
  if (normalizedPhone) userData.ph = [await sha256Hex(normalizedPhone)];
  if (normalizedEmail) userData.em = [await sha256Hex(normalizedEmail)];

  // event_id idêntico entre servidor (CAPI) e navegador (Pixel) para a Meta desduplicar 100%
  const eventId = customEventId || `purchase_${orderId}_musica`;

  const siteUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));
  const eventSourceUrl = `${siteUrl}/entrega?id=${encodeURIComponent(orderId)}`;

  const payload = {
    data: [{
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      event_source_url: eventSourceUrl,
      action_source: 'website',
      user_data: userData,
      custom_data: {
        currency: 'BRL',
        value,
        content_name: contentName,
        content_type: 'product',
      },
    }],
  };

  const results = await Promise.allSettled(
    META_PIXELS.map(async ({ id: pixelId, tokenEnv, fallbackTokenEnv }) => {
      const accessToken = readEnvValue(env, tokenEnv) || (fallbackTokenEnv ? readEnvValue(env, fallbackTokenEnv) : '');
      if (!accessToken) {
        console.warn(`[meta-capi] Token não configurado para o pixel ${pixelId} (variável ${tokenEnv}) — Purchase não enviado para este pixel.`);
        return { pixelId, sent: false, reason: 'no_token' };
      }

      try {
        const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${pixelId}/events?access_token=${accessToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.warn(`[meta-capi] Falha ao enviar evento para o pixel ${pixelId} (HTTP ${res.status}):`, errText.slice(0, 300));
          return { pixelId, sent: false, reason: 'http_error' };
        }
        return { pixelId, sent: true };
      } catch (err) {
        console.warn(`[meta-capi] Erro de rede ao enviar evento para o pixel ${pixelId}:`, err.message);
        return { pixelId, sent: false, reason: err.message };
      }
    })
  );

  const anySent = results.some((r) => r.status === 'fulfilled' && r.value.sent);
  if (anySent) {
    return { sent: true };
  }

  const firstReason = results[0]?.status === 'fulfilled' ? results[0].value.reason : 'network_error';
  return { sent: false, reason: firstReason || 'no_token' };
}
