'use client';

import { supabase } from './supabase.js';
import { isJwtExpiredOrExpiring } from './supabase-edge.js';

// Um único refresh em voo por vez: o dashboard monta ~7 consumidores ao mesmo tempo (hooks de
// pedidos, badges, gasto de anúncios) e, com o token vencido, cada um disparava o próprio refresh
// com o MESMO refresh token. Com rotação de refresh token, as chamadas perdedoras podem falhar e o
// fluxo de falha apaga a sessão do localStorage — derrubando as demais requisições com 401.
let refreshEmVoo = null;

export async function getAdminAuthToken(force = false) {
  if (typeof window === 'undefined') return null;
  let token = localStorage.getItem('supabase_admin_token') || localStorage.getItem('supabase_auth_token') || null;
  if (force || isJwtExpiredOrExpiring(token)) {
    if (supabase?.auth?.refreshSession) {
      if (!refreshEmVoo) {
        refreshEmVoo = supabase.auth.refreshSession().finally(() => {
          refreshEmVoo = null;
        });
      }
      const res = await refreshEmVoo;
      if (res?.data?.session?.access_token) {
        token = res.data.session.access_token;
      }
    }
  }
  return token;
}

export async function signInWithGoogle(redirectTo) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const target = redirectTo || (typeof window !== 'undefined' ? `${window.location.origin}/conta` : '');
  return supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: target } });
}

export async function signInWithEmailAndPassword(_unusedAuth, email, password) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const err = new Error(error.message);
    err.code = 'auth/invalid-credential';
    throw err;
  }
  return data;
}

export async function createUserWithEmailAndPassword(_unusedAuth, email, password, metadata = {}) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const signUpOptions = (metadata && Object.keys(metadata).length > 0) ? { data: metadata } : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    ...(signUpOptions ? { options: signUpOptions } : {})
  });
  if (error) {
    const err = new Error(error.message);
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('already registered') || msg.includes('already in use') || msg.includes('user already exists')) {
      err.code = 'auth/email-already-in-use';
    } else if (msg.includes('weak') || msg.includes('least 6') || msg.includes('password')) {
      err.code = 'auth/weak-password';
    } else if (msg.includes('rate limit') || msg.includes('too many')) {
      err.code = 'auth/too-many-requests';
    } else if (msg.includes('invalid') && msg.includes('email')) {
      err.code = 'auth/invalid-email';
    } else {
      err.code = error.code || 'auth/signup-failed';
    }
    throw err;
  }
  return data;
}

export async function sendPasswordResetEmail(_unusedAuth, email, redirectTo) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const defaultTarget = (typeof window !== 'undefined' && !isLocal)
    ? `${window.location.origin}/login?modo=redefinir`
    : 'https://nsmusic.ia.br/login?modo=redefinir';
  const target = redirectTo || defaultTarget;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: target });
  if (error) {
    const err = new Error(error.message);
    err.code = 'auth/user-not-found';
    throw err;
  }
  return true;
}

export async function updatePassword(newPassword) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    const err = new Error(error.message);
    err.code = 'auth/update-failed';
    throw err;
  }
  return data;
}

export function onAuthStateChanged(_unusedAuth, callback, errorCallback) {
  if (!supabase?.auth) {
    try { callback(null); } catch {}
    return () => {};
  }
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    try {
      callback(session?.user || null);
    } catch (err) {
      if (errorCallback) errorCallback(err);
    }
  });
  return () => {
    subscription?.unsubscribe();
  };
}

export async function signOut(_unusedAuth) {
  if (supabase?.auth) {
    await supabase.auth.signOut();
  }
  return true;
}

export async function signOutAdmin() {
  return signOut();
}

export const auth = {
  get currentUser() {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
    const rawUser = localStorage.getItem('supabase_auth_user') || localStorage.getItem('supabase_admin_user');
    if (!token || !rawUser) return null;
    try {
      const user = JSON.parse(rawUser);
      return {
        ...user,
        uid: user.id || user.uid,
        getIdToken: async (force = false) => {
          let currentToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token') || token;
          if (force || isJwtExpiredOrExpiring(currentToken)) {
            if (supabase?.auth?.refreshSession) {
              const res = await supabase.auth.refreshSession();
              if (res?.data?.session?.access_token) {
                currentToken = res.data.session.access_token;
              }
            }
          }
          return currentToken;
        }
      };
    } catch {
      return null;
    }
  }
};

export const authClient = auth;
export default auth;

