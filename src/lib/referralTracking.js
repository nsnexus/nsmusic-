const KEY = 'nsmusic_referral';
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const valid = value => typeof value === 'string' && /^[a-z0-9]{6,32}$/.test(value);

// First-touch attribution; no contact details or tokens are stored here.
export function readReferralCode() {
  if (typeof window === 'undefined') return null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (valid(saved?.code) && Number(saved.expiresAt) > Date.now()) return saved.code;
    localStorage.removeItem(KEY);
    const code = new URLSearchParams(window.location.search).get('ref')?.trim().toLowerCase();
    if (!valid(code)) return null;
    localStorage.setItem(KEY, JSON.stringify({ code, expiresAt: Date.now() + WINDOW_MS }));
    return code;
  } catch {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim().toLowerCase();
    return valid(code) ? code : null;
  }
}
