import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireAdmin, verifySupabaseToken } from '@/lib/auth';

// requireAdmin substitui a checagem legada de admin no browser por um token de Supabase Auth
// validado no servidor via GoTrue (/auth/v1/user). Aceita dois mecanismos (OR):
// 1. Role 'admin' nos metadados (app_metadata ou user_metadata)
// 2. Allowlist de e-mail `ADMIN_EMAILS`

function makeRequest(bearer) {
  const headers = new Headers();
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  return { headers };
}

const ENV = {
  ADMIN_EMAILS: 'admin@example.com',
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key'
};

describe('requireAdmin', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejeita com 401 quando não há header Authorization', async () => {
    const result = await requireAdmin(makeRequest(null), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejeita com 401 quando o token é inválido/expirado (Supabase recusa)', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    const result = await requireAdmin(makeRequest('token-invalido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejeita com 403 quando o e-mail da conta não está na allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'uid1', email: 'nao-admin@example.com', email_confirmed_at: '2026-09-25T10:00:00Z' }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('aceita quando o token é válido e o e-mail está na allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'uid-admin', email: 'admin@example.com', email_confirmed_at: '2026-09-25T10:00:00Z' }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
    expect(result.uid).toBe('uid-admin');
    expect(result.email).toBe('admin@example.com');
  });

  it('comparação de e-mail na allowlist é case-insensitive', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'uid-admin', email: 'ADMIN@EXAMPLE.COM', email_confirmed_at: '2026-09-25T10:00:00Z' }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
  });

  it('aceita via role admin no app_metadata mesmo com e-mail fora da allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'uid-claim',
        email: 'outra-conta@example.com',
        email_confirmed_at: '2026-09-25T10:00:00Z',
        app_metadata: { role: 'admin' },
      }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
    expect(result.uid).toBe('uid-claim');
  });

  it('aceita via role admin no user_metadata mesmo com e-mail fora da allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'uid-claim-user',
        email: 'outra-conta@example.com',
        email_confirmed_at: '2026-09-25T10:00:00Z',
        user_metadata: { role: 'admin' },
      }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
    expect(result.uid).toBe('uid-claim-user');
  });

  it('role diferente de admin não concede acesso sem allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'uid2',
        email: 'nao-admin@example.com',
        email_confirmed_at: '2026-09-25T10:00:00Z',
        app_metadata: { role: 'user' },
      }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('rejeita com 401 se variáveis do Supabase não estiverem configuradas', async () => {
    const emptyEnv = { ADMIN_EMAILS: 'admin@example.com' };
    const result = await requireAdmin(makeRequest('token-valido'), emptyEnv);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });
});
