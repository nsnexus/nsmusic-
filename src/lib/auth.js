// Verificação de identidade de administrador no servidor (Supabase Auth).
//
// O projeto é Edge-only. O token de sessão JWT do Supabase é validado via endpoint /auth/v1/user
// da API do Supabase, que confirma assinatura e expiração e devolve os dados da conta.
//
// A identidade de admin usa:
//   1. Role 'admin' nos metadados do usuário (app_metadata ou user_metadata).
//   2. Allowlist de e-mail `ADMIN_EMAILS`. Qualquer um dos dois concede acesso.

export async function verifySupabaseToken(token, env = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${token}`
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;
    const user = await res.json().catch(() => null);
    if (!user || !user.id) return null;

    return {
      uid: user.id,
      email: user.email || null,
      emailVerified: Boolean(user.email_confirmed_at),
      isAdminClaim: user.app_metadata?.role === 'admin' || user.user_metadata?.role === 'admin',
    };
  } catch (err) {
    console.warn('[auth] Falha ao verificar token Supabase:', err.message);
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
 * Exige que a requisição traga um token de Supabase válido, pertencente a uma conta com
 * o role `admin` OU cujo e-mail está na allowlist `ADMIN_EMAILS`.
 * Retorna { ok: true, uid, email } ou { ok: false, status, error }.
 */
export async function requireAdmin(req, env = {}) {
  const idToken = extractBearerToken(req);
  if (!idToken) {
    return { ok: false, status: 401, error: 'Token de autenticação ausente.' };
  }

  const account = await verifySupabaseToken(idToken, env);

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
