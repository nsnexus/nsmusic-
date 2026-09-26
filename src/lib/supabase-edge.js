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
            return { data: null, error: { message: json?.error_description || json?.msg || 'Falha ao autenticar' } };
          }
          if (typeof window !== 'undefined' && json?.access_token) {
            localStorage.setItem('supabase_admin_token', json.access_token);
            localStorage.setItem('supabase_admin_user', JSON.stringify(json.user || {}));
          }
          return { data: { session: json, user: json?.user }, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message } };
        }
      },
      getSession: async () => {
        if (typeof window === 'undefined') return { data: { session: null }, error: null };
        const token = localStorage.getItem('supabase_admin_token');
        const user = JSON.parse(localStorage.getItem('supabase_admin_user') || 'null');
        if (token && user) {
          return { data: { session: { access_token: token, user } }, error: null };
        }
        return { data: { session: null }, error: null };
      },
      signOut: async () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('supabase_admin_token');
          localStorage.removeItem('supabase_admin_user');
        }
        return { error: null };
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
