import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requireAdmin } from '@/lib/auth';

// requireAdmin substitui a checagem de admin por comparação de e-mail no browser (A-08 no
// AUDIT_REPORT.md) por um token de Firebase validado no servidor. Aceita dois mecanismos (OR):
// custom claim `admin: true` (definitivo, ver scripts/set-admin-claim.mjs) ou allowlist de e-mail
// `ADMIN_EMAILS` (transição, enquanto a claim não estiver configurada em produção).

function makeRequest(bearer) {
  const headers = new Headers();
  if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
  return { headers };
}

const ENV = { ADMIN_EMAILS: 'admin@example.com', NEXT_PUBLIC_FIREBASE_API_KEY: 'fake-key' };

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

  it('rejeita com 401 quando o token é inválido/expirado (Google recusa)', async () => {
    global.fetch.mockResolvedValue({ ok: false });
    const result = await requireAdmin(makeRequest('token-invalido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
  });

  it('rejeita com 403 quando o e-mail da conta não está na allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ localId: 'uid1', email: 'nao-admin@example.com', emailVerified: true }] }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });

  it('aceita quando o token é válido e o e-mail está na allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ localId: 'uid-admin', email: 'admin@example.com', emailVerified: true }] }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
    expect(result.uid).toBe('uid-admin');
    expect(result.email).toBe('admin@example.com');
  });

  it('comparação de e-mail na allowlist é case-insensitive', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ users: [{ localId: 'uid-admin', email: 'ADMIN@EXAMPLE.COM', emailVerified: true }] }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
  });

  it('aceita via custom claim admin:true mesmo com e-mail fora da allowlist', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{
          localId: 'uid-claim',
          email: 'outra-conta@example.com',
          emailVerified: true,
          customAttributes: JSON.stringify({ admin: true }),
        }],
      }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(true);
    expect(result.uid).toBe('uid-claim');
  });

  it('customAttributes com admin:false não concede acesso (precisa da allowlist)', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        users: [{
          localId: 'uid2',
          email: 'nao-admin@example.com',
          emailVerified: true,
          customAttributes: JSON.stringify({ admin: false }),
        }],
      }),
    });
    const result = await requireAdmin(makeRequest('token-valido'), ENV);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(403);
  });
});
