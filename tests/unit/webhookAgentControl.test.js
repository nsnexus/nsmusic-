import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendWApiTextMessageMock = vi.fn().mockResolvedValue({ success: true });
const isWhatsAppAgentGloballyEnabledMock = vi.fn().mockResolvedValue(true);
const isAgentPausedForPhoneMock = vi.fn().mockResolvedValue(false);
const handleWhatsAppAgentMessageMock = vi.fn().mockResolvedValue(true);
const findOrderByIdOrNumberMock = vi.fn().mockResolvedValue(null);
const getOrderMock = vi.fn().mockResolvedValue(null);

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} }),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWApiTextMessage: sendWApiTextMessageMock,
  resolveDeliveryUrl: (id) => `https://nsmusic.com.br/entrega?id=${id}`,
  isVideoPurchased: () => false,
  buildAudioDownloadLink: (url) => url,
}));

vi.mock('@/lib/whatsappAgent', () => ({
  isWhatsAppAgentGloballyEnabled: isWhatsAppAgentGloballyEnabledMock,
  isAgentPausedForPhone: isAgentPausedForPhoneMock,
  pauseAgentForPhone: vi.fn(),
  resumeAgentForPhone: vi.fn(),
  handleWhatsAppAgentMessage: handleWhatsAppAgentMessageMock,
}));

vi.mock('@/lib/orderLookup', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    findOrderByIdOrNumber: findOrderByIdOrNumberMock,
  };
});

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: getOrderMock,
  updateOrder: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }),
      }),
      upsert: vi.fn().mockResolvedValue({}),
    }),
  }),
}));

describe('WhatsApp Webhook — controle master e silêncio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isWhatsAppAgentGloballyEnabledMock.mockResolvedValue(true);
    isAgentPausedForPhoneMock.mockResolvedValue(false);
    findOrderByIdOrNumberMock.mockResolvedValue(null);
    getOrderMock.mockResolvedValue(null);
  });

  it('silencia imediatamente e NÃO envia mensagem quando o robô está desativado globalmente e a mensagem é casual', async () => {
    isWhatsAppAgentGloballyEnabledMock.mockResolvedValue(false);

    const { POST } = await import('@/app/api/whatsapp/webhook/route');

    const req = new Request('https://nsmusic.com.br/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgContent: { conversation: 'Olá, tudo bem?' },
        sender: { id: '5511999998888' },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ignored).toBe('agent_globally_disabled');
    expect(sendWApiTextMessageMock).not.toHaveBeenCalled();
    expect(handleWhatsAppAgentMessageMock).not.toHaveBeenCalled();
  });

  it('permite envio da prévia mesmo com o robô desativado se o cliente clicou no botão do site', async () => {
    isWhatsAppAgentGloballyEnabledMock.mockResolvedValue(false);

    const mockOrder = {
      id: 'order123',
      orderNumber: 'NS-1234-2026',
      customerName: 'Maria',
      honoreeName: 'João',
      audioUrl: 'https://cdn.nsmusic.com.br/audio1.mp3',
      paymentStatus: 'PENDENTE',
    };
    findOrderByIdOrNumberMock.mockResolvedValue(mockOrder);
    getOrderMock.mockResolvedValue(mockOrder);

    const { POST } = await import('@/app/api/whatsapp/webhook/route');

    const req = new Request('https://nsmusic.com.br/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgContent: { conversation: 'Olá! Quero receber a prévia da música do meu pedido id=order123' },
        sender: { id: '5511999998888' },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.action).toBe('sent_ready_link');
    expect(sendWApiTextMessageMock).toHaveBeenCalledTimes(1);
    expect(sendWApiTextMessageMock).toHaveBeenCalledWith(
      '5511999998888',
      expect.stringContaining('A música de João ficou pronta'),
      expect.anything()
    );
  });

  it('silencia quando o atendimento humano está ativo para aquele telefone específico em conversa comum', async () => {
    isWhatsAppAgentGloballyEnabledMock.mockResolvedValue(true);
    isAgentPausedForPhoneMock.mockResolvedValue(true);

    const { POST } = await import('@/app/api/whatsapp/webhook/route');

    const req = new Request('https://nsmusic.com.br/api/whatsapp/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgContent: { conversation: 'Você pode me responder por favor?' },
        sender: { id: '5511999998888' },
      }),
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ignored).toBe('human_takeover_active');
    expect(sendWApiTextMessageMock).not.toHaveBeenCalled();
  });
});
