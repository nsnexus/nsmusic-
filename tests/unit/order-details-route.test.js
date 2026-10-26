import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/orderLookup', () => ({
  findOrderByIdOrNumber: vi.fn(),
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => null),
}));

vi.mock('@/lib/audioHistory', () => ({
  buildOrderAudioHistory: vi.fn((order) => order.audioHistory || []),
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: {} })),
}));

import { GET } from '@/app/api/orders/[id]/route';
import { findOrderByIdOrNumber } from '@/lib/orderLookup';

function createRequest() {
  return new Request('https://nsmusic.com.br/api/orders/ord-123');
}

describe('GET /api/orders/[id] - Sanitização de Pedido Não Pago', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('para pedido não pago, NÃO expõe URLs brutas de CDN/Suno nem payloads sensíveis', async () => {
    findOrderByIdOrNumber.mockResolvedValue({
      id: 'ord-123',
      orderNumber: 'NS12345',
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      customerName: 'Cliente Teste',
      audioUrl: 'https://cdn.suno.ai/song1-full-hd.mp3',
      audioFiles: [
        'https://cdn.suno.ai/song1-full-hd.mp3',
        'https://cdn.suno.ai/song2-full-hd.mp3'
      ],
      audioHistory: [
        {
          taskId: 'task-abc',
          tracks: [{ url: 'https://cdn.suno.ai/song1-full-hd.mp3' }]
        }
      ],
      extras: {
        rawSunoPayload: { secretToken: '123' },
        normalExtra: 'ok'
      }
    });

    const res = await GET(createRequest(), { params: { id: 'ord-123' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    const order = data.order;

    expect(order.audioUrl).toBe('/api/audio/proxy?orderId=ord-123&faixa=0');
    expect(order.audioFiles[0]).toBe('/api/audio/proxy?orderId=ord-123&faixa=0');
    expect(order.audioFiles[1]).toBe('/api/audio/proxy?orderId=ord-123&faixa=1');
    expect(order.audioHistory[0].tracks[0].url).not.toContain('suno.ai');
    expect(order.extras.rawSunoPayload).toBeUndefined();
    expect(order.extras.normalExtra).toBe('ok');
  });

  it('para pedido PAGO, mantém URLs e dados completos para entrega', async () => {
    findOrderByIdOrNumber.mockResolvedValue({
      id: 'ord-123',
      orderNumber: 'NS12345',
      paymentStatus: 'PAGAMENTO_APROVADO',
      audioUrl: 'https://r2.nsmusic.com.br/audios/ord-123/v1.mp3',
      audioFiles: ['https://r2.nsmusic.com.br/audios/ord-123/v1.mp3'],
      extras: { normalExtra: 'ok' }
    });

    const res = await GET(createRequest(), { params: { id: 'ord-123' } });
    expect(res.status).toBe(200);
    const data = await res.json();
    const order = data.order;

    expect(order.audioUrl).toBe('https://r2.nsmusic.com.br/audios/ord-123/v1.mp3');
    expect(order.audioFiles[0]).toBe('https://r2.nsmusic.com.br/audios/ord-123/v1.mp3');
  });
});
