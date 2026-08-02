import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateTxid, createPixCharge, getChargeStatus } from '@/lib/efi';

// A API Pix da Efí exige mTLS em toda chamada (ver docs/EFI_SETUP.md). Como Cloudflare Pages não
// suporta binding de certificado mTLS, esse hop é feito por um Worker dedicado
// (workers/efi-proxy/), chamado por este módulo via HTTPS simples. Aqui simulamos esse Worker
// mockando o `fetch` global e devolvendo `Response` reais, do mesmo jeito que o Worker responde
// (passthrough transparente da resposta da Efí).

function makeEnv(overrides = {}) {
  return {
    EFI_CLIENT_ID: 'client-id',
    EFI_CLIENT_SECRET: 'client-secret',
    EFI_PIX_KEY: 'chave-pix-teste',
    EFI_ENV: 'sandbox',
    EFI_PROXY_URL: 'https://nsmusic-efi-proxy.example.workers.dev',
    EFI_PROXY_SECRET: 'proxy-secret-teste',
    ...overrides,
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateTxid', () => {
  it('gera um txid alfanumérico com 26 a 35 caracteres', () => {
    const txid = generateTxid('order-123');
    expect(txid).toMatch(/^[A-Z0-9]+$/);
    expect(txid.length).toBeGreaterThanOrEqual(26);
    expect(txid.length).toBeLessThanOrEqual(35);
  });

  it('gera txids diferentes em chamadas sucessivas', () => {
    const a = generateTxid('order-123');
    const b = generateTxid('order-123');
    expect(a).not.toBe(b);
  });

  it('funciona mesmo com orderId vazio (usa NSMUSIC como base)', () => {
    const txid = generateTxid('');
    expect(txid).toMatch(/^[A-Z0-9]+$/);
    expect(txid.length).toBeGreaterThanOrEqual(26);
  });
});

describe('createPixCharge', () => {
  it('cria a cobrança e retorna txid + pixCopiaECola', async () => {
    const relayFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(jsonResponse({ txid: 'TXID_DA_RESPOSTA', pixCopiaECola: '000201...copia-e-cola', status: 'ATIVA' }));
    vi.stubGlobal('fetch', relayFetch);

    const result = await createPixCharge({ orderId: 'order-1', amount: 9.99 }, makeEnv());

    expect(result.txid).toBe('TXID_DA_RESPOSTA');
    expect(result.pixCopiaECola).toBe('000201...copia-e-cola');
    expect(relayFetch).toHaveBeenCalledTimes(2);

    const [relayUrl, relayOptions] = relayFetch.mock.calls[0];
    expect(relayUrl).toBe('https://nsmusic-efi-proxy.example.workers.dev/relay');
    expect(relayOptions.headers['X-Efi-Proxy-Secret']).toBe('proxy-secret-teste');
    const tokenEnvelope = JSON.parse(relayOptions.body);
    expect(tokenEnvelope.env).toBe('sandbox');
    expect(tokenEnvelope.path).toBe('/oauth/token');
    expect(tokenEnvelope.headers.Authorization).toMatch(/^Basic /);

    const [, cobOptions] = relayFetch.mock.calls[1];
    const cobEnvelope = JSON.parse(cobOptions.body);
    expect(cobEnvelope.path).toContain('/v2/cob/');
    expect(cobEnvelope.method).toBe('PUT');
    expect(cobEnvelope.headers.Authorization).toBe('Bearer token-123');
    const body = JSON.parse(cobEnvelope.body);
    expect(body.valor.original).toBe('9.99');
    expect(body.chave).toBe('chave-pix-teste');
  });

  it('usa env=production no envelope quando EFI_ENV=production', async () => {
    const relayFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(jsonResponse({ txid: 'X', pixCopiaECola: 'y', status: 'ATIVA' }));
    vi.stubGlobal('fetch', relayFetch);

    await createPixCharge({ orderId: 'order-1', amount: 9.99 }, makeEnv({ EFI_ENV: 'production' }));

    const tokenEnvelope = JSON.parse(relayFetch.mock.calls[0][1].body);
    expect(tokenEnvelope.env).toBe('production');
  });

  it('lança erro claro quando EFI_PROXY_URL/EFI_PROXY_SECRET não estão configurados', async () => {
    await expect(
      createPixCharge({ orderId: 'order-1', amount: 9.99 }, makeEnv({ EFI_PROXY_URL: '', EFI_PROXY_SECRET: '' }))
    ).rejects.toThrow(/EFI_PROXY_URL\/EFI_PROXY_SECRET/);
  });

  it('lança erro quando EFI_PIX_KEY não está configurada', async () => {
    const relayFetch = vi.fn();
    vi.stubGlobal('fetch', relayFetch);
    await expect(
      createPixCharge({ orderId: 'order-1', amount: 9.99 }, makeEnv({ EFI_PIX_KEY: '' }))
    ).rejects.toThrow(/EFI_PIX_KEY/);
    expect(relayFetch).not.toHaveBeenCalled();
  });

  it('propaga erro quando a Efí recusa a criação da cobrança', async () => {
    const relayFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(jsonResponse({ nome: 'valor_invalido' }, 400));
    vi.stubGlobal('fetch', relayFetch);

    await expect(
      createPixCharge({ orderId: 'order-1', amount: 9.99 }, makeEnv())
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe('getChargeStatus', () => {
  it('retorna o status da cobrança', async () => {
    const relayFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'CONCLUIDA', valor: { original: '9.99' } }));
    vi.stubGlobal('fetch', relayFetch);

    const charge = await getChargeStatus('TXID123', makeEnv());
    expect(charge.status).toBe('CONCLUIDA');
    expect(charge.valor.original).toBe('9.99');
  });

  it('retorna null quando a cobrança não existe (404)', async () => {
    const relayFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123' }))
      .mockResolvedValueOnce(jsonResponse({}, 404));
    vi.stubGlobal('fetch', relayFetch);

    const charge = await getChargeStatus('TXID-INEXISTENTE', makeEnv());
    expect(charge).toBeNull();
  });

  it('retorna null quando txid está vazio, sem chamar a API', async () => {
    const relayFetch = vi.fn();
    vi.stubGlobal('fetch', relayFetch);
    const charge = await getChargeStatus('', makeEnv());
    expect(charge).toBeNull();
    expect(relayFetch).not.toHaveBeenCalled();
  });
});
