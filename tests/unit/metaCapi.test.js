import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendMetaPurchaseEvent, META_PIXELS, META_PIXEL_ID } from '@/lib/metaCapi';

describe('metaCapi (Meta Conversions API)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('possui os Pixel IDs configurados', () => {
    expect(META_PIXEL_ID).toBe('1366434898413500');
    expect(META_PIXELS.map((p) => p.id)).toContain('1366434898413500');
    expect(META_PIXELS.map((p) => p.id)).toContain('1450829683640531');
  });

  it('retorna no_token se nenhum token estiver configurado', async () => {
    const result = await sendMetaPurchaseEvent(
      { orderId: 'ord-1', value: 9.99, contentName: 'Música' },
      { META_CAPI_ACCESS_TOKEN: '', META_CAPI_ACCESS_TOKEN_2: '' }
    );

    expect(result).toEqual({ sent: false, reason: 'no_token' });
  });

  it('retorna invalid_value se o valor for inválido ou zero', async () => {
    const result = await sendMetaPurchaseEvent(
      { orderId: 'ord-1', value: 0, contentName: 'Música' },
      { META_CAPI_ACCESS_TOKEN: 'token_mock' }
    );

    expect(result).toEqual({ sent: false, reason: 'invalid_value' });
  });

  it('monta o payload com client_ip_address, client_user_agent, fbc, fbp, external_id e hashes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events_received: 1 }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendMetaPurchaseEvent(
      {
        orderId: 'ord-meta-123',
        value: 16.89,
        contentName: 'Música Homenagem',
        customerPhone: '(11) 98765-4321',
        customerEmail: 'cliente@exemplo.com',
        clientIpAddress: '177.18.23.45',
        clientUserAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        fbp: 'fb.1.1691234567890.1234567890',
        fbclid: 'IwAR1234567890abcdef',
      },
      {
        META_CAPI_ACCESS_TOKEN: 'mock_token_pixel_1',
        META_CAPI_ACCESS_TOKEN_2: 'mock_token_pixel_2',
        NEXT_PUBLIC_SITE_URL: 'https://nsmusic.com.br',
      }
    );

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v21.0/1366434898413500/events?access_token=mock_token_pixel_1');

    const body = JSON.parse(options.body);
    const event = body.data[0];

    expect(event.event_name).toBe('Purchase');
    expect(event.action_source).toBe('website');
    expect(event.custom_data.value).toBe(16.89);
    expect(event.custom_data.currency).toBe('BRL');

    // Validação de IP do cliente (NÃO hasheado segundo diretriz da Meta)
    expect(event.user_data.client_ip_address).toBe('177.18.23.45');

    // Validação de User-Agent do cliente (NÃO hasheado segundo diretriz da Meta)
    expect(event.user_data.client_user_agent).toBe('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');

    // Cookies e IDs de clique
    expect(event.user_data.fbp).toBe('fb.1.1691234567890.1234567890');
    expect(event.user_data.fbc).toMatch(/^fb\.1\.\d+\.IwAR1234567890abcdef$/);

    // Hashes SHA-256 para PII (telefone com DDI 55, email e external_id)
    expect(event.user_data.ph).toHaveLength(1);
    expect(event.user_data.ph[0]).toHaveLength(64); // SHA-256 hex tem 64 caracteres
    expect(event.user_data.em).toHaveLength(1);
    expect(event.user_data.em[0]).toHaveLength(64);
    expect(event.user_data.external_id).toHaveLength(1);
    expect(event.user_data.external_id[0]).toHaveLength(64);
  });
});

