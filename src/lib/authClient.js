'use client';

/**
 * Utilitário client-side para obter o token de autenticação de administrador,
 * suportando tanto Supabase Auth quanto Firebase Auth transparentemente.
 */
export async function getAdminAuthToken() {
  if (typeof window === 'undefined') return null;

  // 1. Tenta recuperar token de sessão do Supabase Auth
  const sbToken = localStorage.getItem('supabase_admin_token');
  if (sbToken) {
    return sbToken;
  }

  // 2. Fallback no Firebase Auth ID Token
  try {
    const { auth } = await import('@/lib/firebase');
    if (auth?.currentUser) {
      return await auth.currentUser.getIdToken();
    }
  } catch (err) {
    console.warn('[authClient] Falha ao obter Firebase ID token:', err.message);
  }

  return null;
}

/**
 * Efetua logout em ambos os provedores.
 */
export async function signOutAdmin() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('supabase_admin_token');
    localStorage.removeItem('supabase_admin_user');
  }

  try {
    const { auth } = await import('@/lib/firebase');
    const { signOut } = await import('firebase/auth');
    if (auth) {
      await signOut(auth);
    }
  } catch (err) {
    console.warn('[authClient] Falha ao deslogar Firebase:', err.message);
  }
}
