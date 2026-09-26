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
    const list = Array.isArray(values) ? values.join(',') : String(values);
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

export class NativeSupabaseClient {
  constructor(url, apiKey) {
    this.url = url;
    this.apiKey = apiKey;
  }

  from(tableName) {
    return new SupabaseTableQuery(this.url, this.apiKey, tableName);
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
        uid: user.id,
        email: user.email || '',
        getIdToken: async () => token || (typeof window !== 'undefined' ? localStorage.getItem('supabase_auth_token') : ''),
      };
    };

    return {
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
          const user = normalizeUser(json?.user, token);
          const session = token ? { access_token: token, user } : null;

          if (typeof window !== 'undefined' && token) {
            localStorage.setItem('supabase_auth_token', token);
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
            localStorage.setItem('supabase_admin_token', token);
            localStorage.setItem('supabase_admin_user', JSON.stringify(user));
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
          const user = normalizeUser(json?.user || json, token);
          const session = token ? { access_token: token, user } : null;

          if (typeof window !== 'undefined' && token) {
            localStorage.setItem('supabase_auth_token', token);
            localStorage.setItem('supabase_auth_user', JSON.stringify(user));
          }
          notifyAuthChange('SIGNED_UP', session);
          return { data: { session, user }, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },

      resetPasswordForEmail: async (email, options = {}) => {
        try {
          const res = await fetch(`${this.url.replace(/\/$/, '')}/auth/v1/recover`, {
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

      getSession: async () => {
        if (typeof window === 'undefined') return { data: { session: null }, error: null };
        const token = localStorage.getItem('supabase_auth_token') || localStorage.getItem('supabase_admin_token');
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
          localStorage.removeItem('supabase_admin_token');
          localStorage.removeItem('supabase_admin_user');
        }
        notifyAuthChange('SIGNED_OUT', null);
        return { error: null };
      },

      onAuthStateChange: (callback) => {
        if (typeof window === 'undefined') {
          return { data: { subscription: { unsubscribe: () => {} } } };
        }

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
