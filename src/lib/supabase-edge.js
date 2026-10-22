/**
 * Cliente Supabase / PostgREST nativo com zero dependências externas.
 * 100% compatível com Edge Runtime da Cloudflare Pages e scripts Node.
 * Usa standard fetch nativo para comunicação direta com o PostgREST do Supabase.
 */

class SupabaseTableQuery {
  constructor(baseUrl, apiKey, tableName) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.tableName = tableName;
    this.queryParams = new URLSearchParams();
    this.headers = {
      'apikey': this.apiKey,
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Upsert idempotente de registros.
   * Suporta onConflict (ex: 'id' ou 'txid,kind').
   */
  async upsert(data, options = {}) {
    const url = new URL(`${this.baseUrl}/rest/v1/${this.tableName}`);
    if (options.onConflict) {
      url.searchParams.set('on_conflict', options.onConflict);
    }

    const payload = Array.isArray(data) ? data : [data];

    try {
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          ...this.headers,
          'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeout || 12000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { data: null, error: { message: `HTTP ${res.status}: ${errorText}` } };
      }

      const resData = await res.json().catch(() => null);
      return { data: resData, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message || 'Erro de rede ao conectar ao Supabase' } };
    }
  }

  /**
   * Inserção simples.
   */
  async insert(data, options = {}) {
    const url = `${this.baseUrl}/rest/v1/${this.tableName}`;
    const payload = Array.isArray(data) ? data : [data];

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.headers,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(options.timeout || 12000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { data: null, error: { message: `HTTP ${res.status}: ${errorText}` } };
      }

      const resData = await res.json().catch(() => null);
      return { data: resData, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  /**
   * Atualização parcial de registros existentes (PATCH).
   * Ex: supabase.from('orders').eq('id', orderId).update({ audio_url: '...' })
   */
  async update(data, options = {}) {
    const url = `${this.baseUrl}/rest/v1/${this.tableName}?${this.queryParams.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          ...this.headers,
          'Prefer': 'return=representation',
        },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(options.timeout || 12000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { data: null, error: { message: `HTTP ${res.status}: ${errorText}` } };
      }

      const resData = await res.json().catch(() => null);
      return { data: resData, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  /**
   * Remoção de registros (DELETE).
   */
  async delete(options = {}) {
    const url = `${this.baseUrl}/rest/v1/${this.tableName}?${this.queryParams.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          ...this.headers,
          'Prefer': 'return=representation',
        },
        signal: AbortSignal.timeout(options.timeout || 12000),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        return { data: null, error: { message: `HTTP ${res.status}: ${errorText}` } };
      }

      const resData = await res.json().catch(() => null);
      return { data: resData, error: null };
    } catch (err) {
      return { data: null, error: { message: err.message } };
    }
  }

  /**
   * Leitura de dados (select).
   */
  select(columns = '*') {
    this.queryParams.set('select', columns);
    return this;
  }

  single() {
    this.isSingle = true;
    this.limit(1);
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    this.limit(1);
    return this;
  }

  ilike(column, pattern) {
    this.queryParams.append(column, `ilike.${pattern}`);
    return this;
  }

  like(column, pattern) {
    this.queryParams.append(column, `like.${pattern}`);
    return this;
  }

  eq(column, value) {
    this.queryParams.append(column, `eq.${value}`);
    return this;
  }

  neq(column, value) {
    this.queryParams.append(column, `neq.${value}`);
    return this;
  }

  gt(column, value) {
    this.queryParams.append(column, `gt.${value}`);
    return this;
  }

  gte(column, value) {
    this.queryParams.append(column, `gte.${value}`);
    return this;
  }

  lt(column, value) {
    this.queryParams.append(column, `lt.${value}`);
    return this;
  }

  lte(column, value) {
    this.queryParams.append(column, `lte.${value}`);
    return this;
  }

  is(column, value) {
    this.queryParams.append(column, `is.${value}`);
    return this;
  }

  in(column, values) {
    const arr = Array.isArray(values) ? values : [values];
    const list = arr
      .map((v) => (typeof v === 'number' ? v : `"${String(v).replace(/"/g, '""')}"`))
      .join(',');
    this.queryParams.append(column, `in.(${list})`);
    return this;
  }

  or(filterString) {
    this.queryParams.append('or', `(${filterString})`);
    return this;
  }

  order(column, { ascending = true } = {}) {
    this.queryParams.set('order', `${column}.${ascending ? 'asc' : 'desc'}`);
    return this;
  }

  limit(count) {
    this.queryParams.set('limit', String(count));
    return this;
  }

  offset(count) {
    this.queryParams.set('offset', String(count));
    return this;
  }

  range(from, to) {
    const f = Number(from) || 0;
    const t = Number(to) || f;
    const limit = Math.max(1, t - f + 1);
    this.limit(limit);
    this.offset(f);
    return this;
  }

  async then(resolve, reject) {
    const url = `${this.baseUrl}/rest/v1/${this.tableName}?${this.queryParams.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        resolve({ data: null, error: { message: `HTTP ${res.status}: ${errText}` } });
        return;
      }

      const data = await res.json().catch(() => null);
      if (this.isSingle) {
        if (Array.isArray(data)) {
          if (data.length === 0) {
            resolve({ data: null, error: { message: 'Row not found' } });
            return;
          }
          resolve({ data: data[0], error: null });
          return;
        }
        resolve({ data, error: null });
        return;
      }
      if (this.isMaybeSingle) {
        if (Array.isArray(data)) {
          resolve({ data: data[0] || null, error: null });
          return;
        }
        resolve({ data: data || null, error: null });
        return;
      }
      resolve({ data, error: null });
    } catch (err) {
      resolve({ data: null, error: { message: err.message } });
    }
  }
}

export function isJwtExpiredOrExpiring(token, bufferSeconds = 120) {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('utf8');
    const payload = JSON.parse(jsonStr);
    if (!payload.exp) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp <= (nowSec + bufferSeconds);
  } catch {
    return true;
  }
}

export class NativeSupabaseClient {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
  }

  from(tableName) {
    return new SupabaseTableQuery(this.url, this.apiKey, tableName);
  }

  async rpc(functionName, params = {}, options = {}) {
    try {
      const res = await fetch(`${this.url.replace(/\/$/, '')}/rest/v1/rpc/${encodeURIComponent(functionName)}`, {
        method: 'POST',
        headers: { apikey: this.apiKey, Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(options.timeout || 12000),
      });
      if (!res.ok) return { data: null, error: { message: `HTTP ${res.status}: ${await res.text().catch(() => '')}` } };
      return { data: await res.json().catch(() => null), error: null };
    } catch (err) {
      return { data: null, error: { message: err.message || 'Erro ao executar operação no banco.' } };
    }
  }

  get auth() {
    const notifyAuthChange = (event, session) => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('supabase_auth_change', { detail: { event, session } }));
      }
    };

    const normalizeUser = (user, token) => {
      if (!user) return null;
      return {
        ...user,
        uid: user.id || user.uid,
        email: user.email || '',
        getIdToken: async (force = false) => {
          if (typeof window === 'undefined') return token || '';
          let currentToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token') || token || '';
          if (force || isJwtExpiredOrExpiring(currentToken)) {
            const refreshRes = await this.auth.refreshSession();
            if (refreshRes?.data?.session?.access_token) {
              currentToken = refreshRes.data.session.access_token;
            }
          }
          return currentToken;
        },
      };
    };

    return {
      refreshSession: async () => {
        try {
          if (typeof window === 'undefined') return { data: { session: null }, error: null };
          const refreshToken = localStorage.getItem('supabase_auth_refresh_token') || localStorage.getItem('supabase_admin_refresh_token');
          if (!refreshToken) {
            return { data: { session: null }, error: { message: 'Nenhum refresh token disponível.' } };
          }

          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
              'apikey': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
          });

          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.access_token) {
            localStorage.removeItem('supabase_auth_token');
            localStorage.removeItem('supabase_auth_refresh_token');
            localStorage.removeItem('supabase_admin_token');
            localStorage.removeItem('supabase_admin_refresh_token');
            notifyAuthChange('SIGNED_OUT', null);
            return { data: { session: null }, error: { message: json?.msg || json?.message || 'Sessão expirada' } };
          }

          const newToken = json.access_token;
          const newRefreshToken = json.refresh_token || refreshToken;
          const user = normalizeUser(json.user, newToken);
          const session = { access_token: newToken, refresh_token: newRefreshToken, user };

          localStorage.setItem('supabase_auth_token', newToken);
          localStorage.setItem('supabase_auth_user', JSON.stringify(user));
          localStorage.setItem('supabase_auth_refresh_token', newRefreshToken);
          localStorage.setItem('supabase_admin_token', newToken);
          localStorage.setItem('supabase_admin_user', JSON.stringify(user));
          localStorage.setItem('supabase_admin_refresh_token', newRefreshToken);

          notifyAuthChange('TOKEN_REFRESHED', session);
          return { data: { session, user }, error: null };
        } catch (e) {
          return { data: { session: null }, error: { message: e.message } };
        }
      },

      signInWithPassword: async ({ email, password }) => {
        try {
          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
            method: 'POST',
            headers: {
              'apikey': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            return { data: null, error: { message: json?.error_description || json?.msg || json?.message || 'Falha ao autenticar' } };
          }
          const token = json?.access_token;
          const refreshToken = json?.refresh_token;
          const user = normalizeUser(json?.user, token);
          const session = token ? { access_token: token, refresh_token: refreshToken, user } : null;

          if (typeof window !== 'undefined' && token) {
            localStorage.setItem('supabase_auth_token', token);
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
            localStorage.setItem('supabase_admin_token', token);
            localStorage.setItem('supabase_admin_user', JSON.stringify(user));
            if (refreshToken) {
              localStorage.setItem('supabase_auth_refresh_token', refreshToken);
              localStorage.setItem('supabase_admin_refresh_token', refreshToken);
            }
          }
          notifyAuthChange('SIGNED_IN', session);
          return { data: { session, user }, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },

      signUp: async ({ email, password, options = {} }) => {
        try {
          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/signup`, {
            method: 'POST',
            headers: {
              'apikey': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password, data: options.data || {} })
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            return { data: null, error: { message: json?.error_description || json?.msg || json?.message || 'Falha ao criar conta' } };
          }
          const token = json?.access_token;
          const refreshToken = json?.refresh_token;
          const user = normalizeUser(json?.user || json, token);
          const session = token ? { access_token: token, refresh_token: refreshToken, user } : null;

          if (typeof window !== 'undefined' && token) {
            localStorage.setItem('supabase_auth_token', token);
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
            if (refreshToken) {
              localStorage.setItem('supabase_auth_refresh_token', refreshToken);
            }
          }
          notifyAuthChange('SIGNED_UP', session);
          return { data: { session, user }, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },

      resetPasswordForEmail: async (email, options = {}) => {
        try {
          const redirectTo = options.redirectTo || options.redirect_to || (typeof window !== 'undefined' ? `${window.location.origin}/login?modo=redefinir` : 'https://nsmusic.ia.br/login?modo=redefinir');
          const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/recover${query}`, {
            method: 'POST',
            headers: {
              'apikey': this.apiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, ...options })
          });
          if (!res.ok) {
            const json = await res.json().catch(() => null);
            return { data: null, error: { message: json?.error_description || json?.msg || json?.message || 'Falha ao redefinir senha' } };
          }
          return { data: {}, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },

      updateUser: async (attributes = {}) => {
        try {
          let token = typeof localStorage !== 'undefined'
            ? (localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token'))
            : null;
          if (!token) {
            return { data: { user: null }, error: { message: 'Nenhuma sessão ativa para atualizar a conta' } };
          }
          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/user`, {
            method: 'PUT',
            headers: {
              'apikey': this.apiKey,
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(attributes)
          });
          const json = await res.json().catch(() => null);
          if (!res.ok) {
            return { data: { user: null }, error: { message: json?.error_description || json?.msg || json?.message || 'Falha ao atualizar conta' } };
          }
          const user = normalizeUser(json, token);
          if (typeof window !== 'undefined' && user) {
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
            localStorage.setItem('supabase_admin_user', JSON.stringify(user));
          }
          notifyAuthChange('USER_UPDATED', { access_token: token, user });
          return { data: { user }, error: null };
        } catch (e) {
          return { data: { user: null }, error: { message: e.message } };
        }
      },

      getSession: async () => {
        if (typeof window === 'undefined') return { data: { session: null }, error: null };
        let token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
        if (isJwtExpiredOrExpiring(token)) {
          const refreshRes = await this.auth.refreshSession();
          if (refreshRes?.data?.session) {
            return refreshRes;
          }
        }
        token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
        const rawUser = localStorage.getItem('supabase_auth_user') || localStorage.getItem('supabase_admin_user');
        const user = normalizeUser(rawUser ? JSON.parse(rawUser) : null, token);
        if (token && user) {
          return { data: { session: { access_token: token, user } }, error: null };
        }
        return { data: { session: null }, error: null };
      },

      getUser: async () => {
        const { data: { session } } = await this.auth.getSession();
        return { data: { user: session?.user || null }, error: null };
      },

      signOut: async () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('supabase_auth_token');
          localStorage.removeItem('supabase_auth_user');
          localStorage.removeItem('supabase_auth_refresh_token');
          localStorage.removeItem('supabase_admin_token');
          localStorage.removeItem('supabase_admin_user');
          localStorage.removeItem('supabase_admin_refresh_token');
          sessionStorage.removeItem('supabase_auth_recovery');
        }
        notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      },

      signInWithOAuth: async ({ provider, options = {} }) => {
        try {
          const redirectTo = options.redirectTo || (typeof window !== 'undefined' ? `${window.location.origin}/conta` : 'https://nsmusic.ia.br/conta');
          const authUrl = `${this.url.replace(/\/$/, '')}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(redirectTo)}`;
          if (typeof window !== 'undefined') {
            window.location.replace(authUrl);
          }
          return { data: { url: authUrl }, error: null };
        } catch (err) {
          return { data: null, error: { message: err.message || 'Erro ao iniciar login OAuth' } };
        }
      },

      parseUrlHashSession: () => {
        if (typeof window === 'undefined' || !window.location.hash) return null;
        const hash = window.location.hash.substring(1);
        if (!hash.includes('access_token=')) return null;
        try {
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          const type = params.get('type');
          if (!accessToken) return null;

          let userData = null;
          try {
            const parts = accessToken.split('.');
            if (parts.length === 3) {
              const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
              userData = JSON.parse(decodeURIComponent(escape(atob(base64))));
            }
          } catch {}

          const user = normalizeUser({
            id: userData?.sub || userData?.id,
            email: userData?.email || '',
            user_metadata: userData?.user_metadata || {},
          }, accessToken);

          localStorage.setItem('supabase_auth_token', accessToken);
          localStorage.setItem('supabase_admin_token', accessToken);
          if (user) {
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
            localStorage.setItem('supabase_admin_user', JSON.stringify(user));
          }
          if (refreshToken) {
            localStorage.setItem('supabase_auth_refresh_token', refreshToken);
            localStorage.setItem('supabase_admin_refresh_token', refreshToken);
          }

          if (type === 'recovery') {
            sessionStorage.setItem('supabase_auth_recovery', 'true');
            if (window.location.pathname !== '/login') {
              window.location.replace('/login?modo=redefinir');
              return null;
            }
          }

          const cleanUrl = window.location.pathname + (type === 'recovery' && !window.location.search.includes('modo=redefinir') ? '?modo=redefinir' : window.location.search);
          window.history.replaceState(null, '', cleanUrl);

          const session = { access_token: accessToken, refresh_token: refreshToken, user, type };
          notifyAuthChange(type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN', session);
          return session;
        } catch (e) {
          console.warn('[supabase-auth] Falha ao processar token do hash:', e.message);
          return null;
        }
      },

      onAuthStateChange: (callback) => {
        if (typeof window === 'undefined') {
          return { data: { subscription: { unsubscribe: () => {} } } };
        }

        // Tenta capturar sessão vinda de redirect OAuth (Google, etc.) pelo hash da URL
        try { this.auth.parseUrlHashSession(); } catch {}

        // Emite imediatamente o estado atual
        const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
        const rawUser = localStorage.getItem('supabase_auth_user') || localStorage.getItem('supabase_admin_user');
        const user = normalizeUser(rawUser ? JSON.parse(rawUser) : null, token);
        const initialSession = (token && user) ? { access_token: token, user } : null;
        try {
          callback(initialSession ? 'INITIAL_SESSION' : 'SIGNED_OUT', initialSession);
        } catch {}

        const handler = (evt) => {
          try {
            callback(evt.detail?.event || 'AUTH_CHANGE', evt.detail?.session || null);
          } catch {}
        };

        const storageHandler = (evt) => {
          if (evt.key === 'supabase_auth_token' || evt.key === 'supabase_admin_token') {
            const currentToken = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
            const currentUser = localStorage.getItem('supabase_auth_user') || localStorage.getItem('supabase_admin_user');
            const parsedUser = normalizeUser(currentUser ? JSON.parse(currentUser) : null, currentToken);
            const currentSession = (currentToken && parsedUser) ? { access_token: currentToken, user: parsedUser } : null;
            try {
              callback(currentSession ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', currentSession);
            } catch {}
          }
        };

        window.addEventListener('supabase_auth_change', handler);
        window.addEventListener('storage', storageHandler);

        return {
          data: {
            subscription: {
              unsubscribe: () => {
                window.removeEventListener('supabase_auth_change', handler);
                window.removeEventListener('storage', storageHandler);
              }
            }
          }
        };
      }
    };
  }
}

let cachedClient = null;
let cachedKey = null;

export function getSupabaseEdge(env = {}) {
  const url = env?.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env?.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    return null;
  }

  const cacheId = `${url}:${serviceKey}`;
  if (cachedClient && cachedKey === cacheId) {
    return cachedClient;
  }

  try {
    cachedClient = new NativeSupabaseClient(url, serviceKey);
    cachedKey = cacheId;
    return cachedClient;
  } catch (err) {
    console.warn('[supabase-edge] Falha ao inicializar cliente Supabase:', err.message);
    return null;
  }
}
