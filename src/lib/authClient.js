'use client';

import { supabase } from './supabase.js';
import { isJwtExpiredOrExpiring } from './supabase-edge.js';

export async function getAdminAuthToken(force = false) {
  if (typeof window === 'undefined') return null;
  let token = localStorage.getItem('supabase_admin_token') || localStorage.getItem('supabase_auth_token') || null;
  if (force || isJwtExpiredOrExpiring(token)) {
    if (supabase?.auth?.refreshSession) {
      const res = await supabase.auth.refreshSession();
      if (res?.data?.session?.access_token) {
        token = res.data.session.access_token;
      }
    }
  }
  return token;
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

export async function createUserWithEmailAndPassword(_unusedAuth, email, password) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    const err = new Error(error.message);
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  return data;
}

export async function sendPasswordResetEmail(_unusedAuth, email) {
  if (!supabase?.auth) throw new Error('Serviço de autenticação não configurado.');
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) {
    const err = new Error(error.message);
    err.code = 'auth/user-not-found';
    throw err;
  }
  return true;
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

