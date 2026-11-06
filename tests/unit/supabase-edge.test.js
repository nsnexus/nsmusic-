import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSupabaseEdge, resolveSupabaseConfig } from '../../src/lib/supabase-edge.js';

describe('supabase-edge client', () => {
  it('configura limit e offset corretamente usando range()', () => {
    const client = getSupabaseEdge({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });

    const query = client.from('orders').select('*').range(10, 19);
    expect(query.queryParams.get('limit')).toBe('10');
    expect(query.queryParams.get('offset')).toBe('10');
  });

  it('configura offset() diretamente', () => {
    const client = getSupabaseEdge({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });

    const query = client.from('orders').select('*').offset(50);
    expect(query.queryParams.get('offset')).toBe('50');
  });

  it('adiciona redirect_to como query param ao redefinir senha com resetPasswordForEmail', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      requestedUrl = String(url);
      return { ok: true, json: async () => ({}) };
    });

    try {
      const { NativeSupabaseClient } = await import('../../src/lib/supabase-edge.js');
      const client = new NativeSupabaseClient('https://test.supabase.co', 'test-key');
      await client.auth.resetPasswordForEmail('user@test.com', { redirectTo: 'https://nsmusic.ia.br/login?modo=redefinir' });

      expect(requestedUrl).toContain('/auth/v1/recover?redirect_to=');
      expect(requestedUrl).toContain(encodeURIComponent('https://nsmusic.ia.br/login?modo=redefinir'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('chama PUT /auth/v1/user ao atualizar usuário com updateUser', async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = '';
    let requestOptions = null;
    globalThis.fetch = vi.fn().mockImplementation(async (url, opts) => {
      requestedUrl = String(url);
      requestOptions = opts;
      return { ok: true, json: async () => ({ id: 'usr-1', email: 'user@test.com' }) };
    });

    // Mock localStorage
    const originalLocalStorage = globalThis.localStorage;
    const store = { supabase_auth_token: 'fake-jwt-token' };
    globalThis.localStorage = {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
    };

    try {
      const { NativeSupabaseClient } = await import('../../src/lib/supabase-edge.js');
      const client = new NativeSupabaseClient('https://test.supabase.co', 'test-key');
      const res = await client.auth.updateUser({ password: 'nova-senha-123' });

      expect(requestedUrl).toBe('https://test.supabase.co/auth/v1/user');
      expect(requestOptions.method).toBe('PUT');
      expect(requestOptions.headers.Authorization).toBe('Bearer fake-jwt-token');
      expect(JSON.parse(requestOptions.body)).toEqual({ password: 'nova-senha-123' });
      expect(res.data.user.email).toBe('user@test.com');
    } finally {
      globalThis.fetch = originalFetch;
      globalThis.localStorage = originalLocalStorage;
    }
  });

  describe('resolveSupabaseConfig', () => {
    it('seleciona VPS por padrão quando DATABASE_TARGET não está definido', () => {
      const cfg = resolveSupabaseConfig({
        VPS_SUPABASE_URL: 'https://db.nsmusic.ia.br',
        VPS_SUPABASE_ANON_KEY: 'vps-anon',
        VPS_SUPABASE_SERVICE_ROLE_KEY: 'vps-service',
        CLOUD_SUPABASE_URL: 'https://cloud.supabase.co',
        CLOUD_SUPABASE_ANON_KEY: 'cloud-anon',
        CLOUD_SUPABASE_SERVICE_ROLE_KEY: 'cloud-service',
      });

      expect(cfg.target).toBe('VPS');
      expect(cfg.url).toBe('https://db.nsmusic.ia.br');
      expect(cfg.anonKey).toBe('vps-anon');
      expect(cfg.serviceKey).toBe('vps-service');
    });

    it('alterna para CLOUD quando DATABASE_TARGET=CLOUD', () => {
      const cfg = resolveSupabaseConfig({
        DATABASE_TARGET: 'CLOUD',
        VPS_SUPABASE_URL: 'https://db.nsmusic.ia.br',
        VPS_SUPABASE_ANON_KEY: 'vps-anon',
        VPS_SUPABASE_SERVICE_ROLE_KEY: 'vps-service',
        CLOUD_SUPABASE_URL: 'https://cloud.supabase.co',
        CLOUD_SUPABASE_ANON_KEY: 'cloud-anon',
        CLOUD_SUPABASE_SERVICE_ROLE_KEY: 'cloud-service',
      });

      expect(cfg.target).toBe('CLOUD');
      expect(cfg.url).toBe('https://cloud.supabase.co');
      expect(cfg.anonKey).toBe('cloud-anon');
      expect(cfg.serviceKey).toBe('cloud-service');
    });

    it('faz fallback para NEXT_PUBLIC_SUPABASE_* e SUPABASE_SERVICE_ROLE_KEY se VPS_* não estiverem configuradas', () => {
      const cfg = resolveSupabaseConfig({
        NEXT_PUBLIC_SUPABASE_URL: 'https://legacy.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service',
      });

      expect(cfg.target).toBe('VPS');
      expect(cfg.url).toBe('https://legacy.supabase.co');
      expect(cfg.anonKey).toBe('legacy-anon');
      expect(cfg.serviceKey).toBe('legacy-service');
    });
  });
});
