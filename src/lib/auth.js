// Verificação de identidade de administrador no servidor.
//
// O projeto é Edge-only e não usa o Firebase Admin SDK (ver docs/ARCHITECTURE.md), então não há
// verificação local de assinatura de ID token. Em vez disso, o token é validado pelo próprio Google
// através do endpoint público `accounts:lookup` do Identity Toolkit — ele confirma assinatura,
// expiração e devolve os dados da conta. É o mesmo tipo de validação que o Firebase Admin SDK faria,
// só que via HTTP em vez de biblioteca local, o que funciona no runtime Edge da Cloudflare.
//
// A identidade de admin usa DOIS mecanismos, em ordem de preferência:
//   1. Custom claim `admin: true` no Firebase Auth (definido via scripts/set-admin-claim.mjs, que
//      precisa do Admin SDK e não roda nesta sessão — requer credenciais reais e execução manual).
//   2. Allowlist de e-mail `ADMIN_EMAILS`, mantida só como caminho de transição enquanto a claim não
//      estiver configurada. Qualquer um dos dois concede acesso (OR), nunca substituindo verificação
//      no servidor por checagem no browser — ver `.claude/rules/security.md`.
// O endpoint `accounts:lookup` do Identity Toolkit devolve `customAttributes` (JSON com as custom
// claims) junto da validação de assinatura/expiração do token — não precisa de uma chamada extra.

const IDENTITY_TOOLKIT_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

export async function verifyIdToken(idToken, firebaseApiKey) {
  if (!idToken || !firebaseApiKey) return null;

  try {
    const res = await fetch(`${IDENTITY_TOOLKIT_URL}?key=${firebaseApiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const account = data?.users?.[0];
    if (!account) return null;

    let customClaims = {};
    if (account.customAttributes) {
      try {
        customClaims = JSON.parse(account.customAttributes) || {};
      } catch (e) {
        console.warn('[auth] customAttributes inválido:', e.message);
      }
    }

    return {
      uid: account.localId,
      email: account.email || null,
      emailVerified: account.emailVerified === true,
      isAdminClaim: customClaims.admin === true,
    };
  } catch (err) {
    console.warn('[auth] Falha ao verificar ID token:', err.message);
    return null;
  }
}

function getAdminEmails(env = {}) {
  const raw = env.ADMIN_EMAILS || process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function extractBearerToken(req) {
  const header = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Exige que a requisição traga um ID token de Firebase válido, pertencente a uma conta com o custom
 * claim `admin: true` OU cujo e-mail está na allowlist `ADMIN_EMAILS`.
 * Retorna { ok: true, uid, email } ou { ok: false, status, error }.
 */
export async function requireAdmin(req, env = {}) {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    return { ok: false, status: 401, error: 'Token de autenticação ausente.' };
  }

  const firebaseApiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const account = await verifyIdToken(idToken, firebaseApiKey);
  if (!account) {
    return { ok: false, status: 401, error: 'Token de autenticação inválido ou expirado.' };
  }

  if (account.isAdminClaim) {
    return { ok: true, uid: account.uid, email: account.email };
  }

  const adminEmails = getAdminEmails(env);
  if (adminEmails.length === 0) {
    console.warn('[auth] ADMIN_EMAILS não configurado e nenhum custom claim — nenhuma conta pode ser autorizada.');
  }

  if (!account.email || !adminEmails.includes(account.email.toLowerCase())) {
    return { ok: false, status: 403, error: 'Conta autenticada não tem permissão de administrador.' };
  }

  return { ok: true, uid: account.uid, email: account.email };
}
