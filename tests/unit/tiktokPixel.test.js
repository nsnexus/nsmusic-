import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { identifyTikTok, trackTikTok, TIKTOK_PIXEL_ID, sha256 } from '@/lib/tiktokPixel';

describe('tiktokPixel helper', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    global.window = {
      ttq: {
        identify: vi.fn(),
        track: vi.fn(),
      },
    };
  });

  afterEach(() => {
    global.window = originalWindow;
    vi.restoreAllMocks();
  });

  it('possui o Pixel ID correto do TikTok', () => {
    expect(TIKTOK_PIXEL_ID).toBe('DAUEUPJC77U5PB60GKDG');
  });

  it('identifyTikTok formata telefone com E.164 (+55), limpa e-mail e externalId', async () => {
    await identifyTikTok('(11) 98765-4321', '  Cliente@Email.Com  ', 'order-123');

    expect(global.window.ttq.identify).toHaveBeenCalledWith({
      phone_number: '+5511987654321',
      email: 'cliente@email.com',
      external_id: 'order-123',
    });
  });

  it('identifyTikTok ignora telefone inválido e e-mail sem @', async () => {
    await identifyTikTok('1234', 'email-invalido');

    expect(global.window.ttq.identify).not.toHaveBeenCalled();
  });

  it('trackTikTok dispara o evento com os parâmetros fornecidos', () => {
    const params = {
      contents: [
        {
          content_id: 'audio_only',
          content_type: 'product',
          content_name: 'Música Personalizada com IA',
        },
      ],
      value: 9.99,
      currency: 'BRL',
    };
    trackTikTok('InitiateCheckout', params);

    expect(global.window.ttq.track).toHaveBeenCalledWith('InitiateCheckout', params);
  });

  it('não lança erro se window.ttq não estiver presente', async () => {
    global.window = {};

    await expect(identifyTikTok('11999998888', 'teste@teste.com')).resolves.not.toThrow();
    expect(() => trackTikTok('PageView')).not.toThrow();
  });
});
