import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetOrder = vi.fn();
const mockSendEvolutionMediaMessage = vi.fn();
const mockSendEvolutionTextMessage = vi.fn();

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: (...args) => mockGetOrder(...args),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendEvolutionMediaMessage: (...args) => mockSendEvolutionMediaMessage(...args),
  sendEvolutionTextMessage: (...args) => mockSendEvolutionTextMessage(...args),
}));

const { POST } = await import('@/app/api/orders/send-audio-whatsapp/route');

function makeRequest(body) {
  return new Request('https://nsmusic.nsnexus.com.br/api/orders/send-audio-whatsapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders/send-audio-whatsapp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna 400 se orderId não for informado', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('orderId é obrigatório');
  });

  it('retorna 404 se pedido não for encontrado', async () => {
    mockGetOrder.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderId: 'invalido' }));
    expect(res.status).toBe(404);
  });

  it('retorna 403 se o pedido NÃO estiver pago (regra de segurança)', async () => {
    mockGetOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      customerPhone: '5511999998888',
      audioUrl: 'https://r2.nsmusic.com.br/audio.mp3',
    });

    const res = await POST(makeRequest({ orderId: 'ord-1' }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toContain('confirmação do pagamento');
    expect(mockSendEvolutionMediaMessage).not.toHaveBeenCalled();
  });

  it('retorna 400 se o pedido não tiver telefone cadastrado', async () => {
    mockGetOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'PAGO',
      customerPhone: null,
      audioUrl: 'https://r2.nsmusic.com.br/audio.mp3',
    });

    const res = await POST(makeRequest({ orderId: 'ord-1' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Telefone');
  });

  it('envia áudio como mídia via Evolution API quando pedido está pago', async () => {
    mockGetOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'PAGAMENTO_APROVADO',
      customerPhone: '5511999998888',
      honoreeName: 'Mariana',
      audioFiles: ['https://r2.nsmusic.com.br/m1.mp3', 'https://r2.nsmusic.com.br/m2.mp3'],
    });

    mockSendEvolutionMediaMessage.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ orderId: 'ord-1', trackIndex: 1 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.method).toBe('media');

    expect(mockSendEvolutionMediaMessage).toHaveBeenCalledWith(
      '5511999998888',
      expect.objectContaining({
        mediaUrl: 'https://r2.nsmusic.com.br/m2.mp3',
        mediaType: 'audio',
      }),
      expect.anything()
    );
  });

  it('faz fallback para mensagem com link de download se envio de mídia falhar', async () => {
    mockGetOrder.mockResolvedValue({
      id: 'ord-1',
      paymentStatus: 'PAGO',
      customerPhone: '5511999998888',
      honoreeName: 'Mariana',
      audioUrl: 'https://r2.nsmusic.com.br/m1.mp3',
    });

    mockSendEvolutionMediaMessage.mockResolvedValue({ success: false, error: 'VPS timeout' });
    mockSendEvolutionTextMessage.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ orderId: 'ord-1' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.method).toBe('link');

    expect(mockSendEvolutionTextMessage).toHaveBeenCalledTimes(1);
  });
});

