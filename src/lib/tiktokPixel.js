// Integração com o Pixel do TikTok
// Script base carregado em src/app/layout.jsx com Pixel ID: DAUEUPJC77U5PB60GKDG

export const TIKTOK_PIXEL_ID = 'DAUEUPJC77U5PB60GKDG';

export function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return `+55${digits}`;
}

export function normalizeEmail(email) {
  const trimmed = String(email || '').trim().toLowerCase();
  return trimmed.includes('@') ? trimmed : null;
}

/**
 * Gera hash SHA-256 no navegador para privacidade e conformidade com TikTok Pixel PII
 * @param {string} str 
 * @returns {Promise<string|null>}
 */
export async function sha256(str) {
  if (!str) return null;
  const clean = String(str).trim().toLowerCase();
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(clean);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Identifica o usuário para Advanced Matching no TikTok Pixel com hashing SHA-256 client-side
 * @param {string} phone 
 * @param {string} email 
 * @param {string} [externalId]
 */
export async function identifyTikTok(phone, email, externalId) {
  if (typeof window === 'undefined' || !window.ttq || typeof window.ttq.identify !== 'function') return;

  const ph = normalizePhone(phone);
  const em = normalizeEmail(email);
  const ext = externalId ? String(externalId).trim() : null;
  if (!ph && !em && !ext) return;

  const matchData = {};
  const [hashedPh, hashedEm, hashedExt] = await Promise.all([
    ph ? sha256(ph) : Promise.resolve(null),
    em ? sha256(em) : Promise.resolve(null),
    ext ? sha256(ext) : Promise.resolve(null),
  ]);

  if (hashedPh) matchData.phone_number = hashedPh;
  else if (ph) matchData.phone_number = ph;

  if (hashedEm) matchData.email = hashedEm;
  else if (em) matchData.email = em;

  if (hashedExt) matchData.external_id = hashedExt;
  else if (ext) matchData.external_id = ext;

  try {
    window.ttq.identify(matchData);
  } catch (err) {
    console.warn('[tiktok-pixel] Falha ao identificar usuário:', err?.message);
  }
}

/**
 * Dispara evento do TikTok Pixel com segurança
 * @param {string} eventName 
 * @param {object} params 
 */
export function trackTikTok(eventName, params = {}) {
  if (typeof window === 'undefined' || !window.ttq || typeof window.ttq.track !== 'function') return;

  try {
    window.ttq.track(eventName, params);
  } catch (err) {
    console.warn(`[tiktok-pixel] Falha ao registrar evento ${eventName}:`, err?.message);
  }
}
