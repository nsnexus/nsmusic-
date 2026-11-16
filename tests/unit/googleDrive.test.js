import { it, expect, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { listarPasta } from '../../src/lib/googleDrive.js';
it('assina JWT RS256 válido e lista a pasta', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const conta = { client_email: 'r@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
  let assertion;
  vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
    if (String(url).includes('oauth2')) { assertion = init.body.get('assertion'); return { ok: true, status: 200, json: async () => ({ access_token: 'tok', expires_in: 3600 }) }; }
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(new URL(url).searchParams.get('q')).toContain("'pasta_0123456789' in parents");
    return { ok: true, status: 200, json: async () => ({ files: [{ id: 'abc_0123456789', name: '2026-11-16', mimeType: 'application/vnd.google-apps.folder' }] }) };
  }));
  const r = await listarPasta(conta, 'pasta_0123456789', { apenasPastas: true });
  expect(r[0].nome).toBe('2026-11-16');
  const [h, p, s] = assertion.split('.');
  const v = createVerify('RSA-SHA256'); v.update(`${h}.${p}`);
  expect(v.verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
  expect(JSON.parse(Buffer.from(p, 'base64url')).scope).toContain('drive.readonly');
});
