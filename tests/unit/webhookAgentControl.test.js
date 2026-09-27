import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendWApiTextMessageMock = vi.fn().mockResolvedValue({ success: true });
const isWhatsAppAgentGloballyEnabledMock = vi.fn().mockResolvedValue(true);
const isAgentPausedForPhoneMock = vi.fn().mockResolvedValue(false);
const handleWhatsAppAgentMessageMock = vi.fn().mockResolvedValue(true);

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

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn().mockResolvedValue(null),
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
  });

  it('silencia imediatamente e NÃO envia mensagem quando o robô está desativado globalmente (Atendimento 100% Humano)', async () => {
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

  it('silencia quando o atendimento humano está ativo para aquele telefone específico', async () => {
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
