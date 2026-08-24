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

const META_PIXEL_ID = '1366434898413500';
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
 * Envia um evento de Purchase pro Conversions API da Meta.
 * @param {{orderId: string, value: number, contentName: string, customerPhone?: string, customerEmail?: string}} params
 * @param {object} env contexto de ambiente resolvido pela rota chamadora
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export async function sendMetaPurchaseEvent({ orderId, value, contentName, customerPhone, customerEmail }, env) {
  const accessToken = readEnvValue(env, 'META_CAPI_ACCESS_TOKEN');
  if (!accessToken) {
    console.warn('[meta-capi] META_CAPI_ACCESS_TOKEN não configurado — evento de Purchase não enviado.');
    return { sent: false, reason: 'no_token' };
  }
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

  // event_id estável (orderId + qual produto) — se este evento for reenviado por qualquer motivo, a
  // Meta deduplica sozinha pelo mesmo event_id, então nunca conta duas vezes mesmo em retry.
  const eventId = `purchase_${orderId}_${contentName.replace(/\s+/g, '_').toLowerCase()}`;

  const siteUrl = readEnvValue(env, 'NEXT_PUBLIC_SITE_URL') || 'https://nsmusic.nsnexus.com.br';
  const eventSourceUrl = `${siteUrl.replace(/\/$/, '')}/entrega?id=${encodeURIComponent(orderId)}`;

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

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${META_PIXEL_ID}/events?access_token=${accessToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.warn(`[meta-capi] Falha ao enviar evento (HTTP ${res.status}):`, errText.slice(0, 300));
      return { sent: false, reason: 'http_error' };
    }
    return { sent: true };
  } catch (err) {
    console.warn('[meta-capi] Erro de rede ao enviar evento:', err.message);
    return { sent: false, reason: err.message };
  }
}
