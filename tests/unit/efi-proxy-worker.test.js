import { describe, it, expect, vi } from 'vitest';
import worker from '../../workers/efi-proxy/src/worker.js';

// Worker dedicado ao hop mTLS até a Efí (ver docs/EFI_SETUP.md e o comentário de topo de
// workers/efi-proxy/src/worker.js). Testado direto aqui porque é puro JS com Request/Response da
// Web API — sem dependência de runtime específico da Cloudflare.

const VALID_TXID = 'A'.repeat(30);

function makeEnv(overrides = {}) {
  return {
    EFI_PROXY_SECRET: 'proxy-secret-teste',
    EFI_MTLS_CERT: { fetch: vi.fn() },
    ...overrides,
  };
}

function relayRequest(body, headers = {}) {
  return new Request('https://worker.example/relay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Efi-Proxy-Secret': 'proxy-secret-teste', ...headers },
    body: JSON.stringify(body),
  });
}

describe('efi-proxy worker', () => {
  it('rejeita rota diferente de POST /relay', async () => {
    const res = await worker.fetch(new Request('https://worker.example/outra-rota'), makeEnv());
    expect(res.status).toBe(404);
  });

  it('rejeita secret ausente ou incorreto', async () => {
    const req = relayRequest(
      { env: 'sandbox', path: '/oauth/token', method: 'POST', headers: {}, body: '{}' },
      { 'X-Efi-Proxy-Secret': 'secret-errado' }
    );
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it('rejeita env fora do enum sandbox/production', async () => {
    const req = relayRequest({ env: 'homolog', path: '/oauth/token', method: 'POST', headers: {}, body: '{}' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it('rejeita path fora da allowlist', async () => {
    const req = relayRequest({ env: 'sandbox', path: '/v2/webhook/chave', method: 'PUT', headers: {}, body: '{}' });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it('rejeita txid mal formado em /v2/cob/:txid', async () => {
    const req = relayRequest({ env: 'sandbox', path: '/v2/cob/txid-curto', method: 'GET', headers: {} });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it('rejeita método não permitido para o path', async () => {
    const req = relayRequest({ env: 'sandbox', path: '/oauth/token', method: 'DELETE', headers: {} });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it('repassa a chamada via mTLS e devolve status+corpo tal qual (caminho feliz)', async () => {
    const mtlsFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: 'token-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const env = makeEnv({ EFI_MTLS_CERT: { fetch: mtlsFetch } });

    const req = relayRequest({
      env: 'sandbox',
      path: '/oauth/token',
      method: 'POST',
      headers: { Authorization: 'Basic abc123', 'X-Ignored-Header': 'nao-deveria-passar' },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });

    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.access_token).toBe('token-123');

    expect(mtlsFetch).toHaveBeenCalledTimes(1);
    const [upstreamUrl, upstreamOptions] = mtlsFetch.mock.calls[0];
    expect(upstreamUrl).toBe('https://pix-h.api.efipay.com.br/oauth/token');
    expect(upstreamOptions.method).toBe('POST');
    expect(upstreamOptions.headers.authorization).toBe('Basic abc123');
    expect(upstreamOptions.headers['x-ignored-header']).toBeUndefined();
  });

  it('usa o host de produção quando env=production', async () => {
    const mtlsFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const env = makeEnv({ EFI_MTLS_CERT: { fetch: mtlsFetch } });

    const req = relayRequest({ env: 'production', path: `/v2/cob/${VALID_TXID}`, method: 'GET', headers: {} });
    await worker.fetch(req, env);

    expect(mtlsFetch.mock.calls[0][0]).toBe(`https://pix.api.efipay.com.br/v2/cob/${VALID_TXID}`);
  });

  it('devolve 502 quando a chamada mTLS falha', async () => {
    const mtlsFetch = vi.fn().mockRejectedValue(new Error('handshake TLS recusado'));
    const env = makeEnv({ EFI_MTLS_CERT: { fetch: mtlsFetch } });

    const req = relayRequest({ env: 'sandbox', path: '/oauth/token', method: 'POST', headers: {}, body: '{}' });
    const res = await worker.fetch(req, env);

    expect(res.status).toBe(502);
  });

  it('devolve 500 quando o Worker não tem EFI_MTLS_CERT configurado', async () => {
    const req = relayRequest({ env: 'sandbox', path: '/oauth/token', method: 'POST', headers: {}, body: '{}' });
    const res = await worker.fetch(req, makeEnv({ EFI_MTLS_CERT: undefined }));
    expect(res.status).toBe(500);
  });
});
