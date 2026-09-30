import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendTikTokPurchaseEvent, TIKTOK_PIXEL_ID } from '@/lib/tiktokCapi';

describe('tiktokCapi (TikTok Events API)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('possui o Pixel ID correto do TikTok', () => {
    expect(TIKTOK_PIXEL_ID).toBe('DAUEUPJC77U5PB60GKDG');
  });

  it('retorna no_token se TIKTOK_EVENTS_API_ACCESS_TOKEN não estiver configurado', async () => {
    const result = await sendTikTokPurchaseEvent(
      { orderId: 'ord-1', value: 9.99, contentName: 'Música' },
      { TIKTOK_EVENTS_API_ACCESS_TOKEN: '' }
    );

    expect(result).toEqual({ sent: false, reason: 'no_token' });
  });

  it('retorna invalid_value se o valor for inválido ou zero', async () => {
    const result = await sendTikTokPurchaseEvent(
      { orderId: 'ord-1', value: 0, contentName: 'Música' },
      { TIKTOK_EVENTS_API_ACCESS_TOKEN: 'fake_token' }
    );

    expect(result).toEqual({ sent: false, reason: 'invalid_value' });
  });

  it('monta o payload correto com hash e dispara fetch para a API do TikTok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, message: 'OK' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendTikTokPurchaseEvent(
      {
        orderId: 'ord-123',
        value: 16.89,
        contentName: 'Combo Vídeo',
        sku: 'combo',
        customerPhone: '(11) 98765-4321',
        customerEmail: 'cliente@exemplo.com',
      },
      {
        TIKTOK_EVENTS_API_ACCESS_TOKEN: 'test_token',
        NEXT_PUBLIC_SITE_URL: 'https://nsmusic.ia.br',
      }
    );

    expect(result).toEqual({ sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/event/track/');
    expect(options.headers['Access-Token']).toBe('test_token');
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body.event_source).toBe('web');
    expect(body.event_source_id).toBe('DAUEUPJC77U5PB60GKDG');
    expect(body.data[0].event).toBe('CompletePayment');
    expect(body.data[0].properties.value).toBe(16.89);
    expect(body.data[0].properties.currency).toBe('BRL');
    expect(body.data[0].user.phone).toBeDefined();
    expect(body.data[0].user.email).toBeDefined();
    expect(body.data[0].user.external_id).toBeDefined();
  });
});
