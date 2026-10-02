import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockOrders = {};
let mockUpdates = {};

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: async (id) => mockOrders[id] || null,
  updateOrder: async (id, data) => {
    mockUpdates[id] = data;
    mockOrders[id] = { ...(mockOrders[id] || {}), ...data };
    return { success: true, orderId: id, updated: data };
  }
}));

const { POST } = await import('@/app/api/homenagem/choose-music/route');

describe('POST /api/homenagem/choose-music', () => {
  beforeEach(() => {
    mockOrders = {
      'order-1': {
        id: 'order-1',
        orderNumber: 'NS-100-2026',
        paymentStatus: 'PAGAMENTO_APROVADO',
        audioUrl: 'https://cdn.example.com/audio1.mp3',
        audioFiles: [
          'https://cdn.example.com/audio1.mp3',
          'https://cdn.example.com/audio2.mp3'
        ]
      },
      'order-unpaid': {
        id: 'order-unpaid',
        paymentStatus: 'AGUARDANDO_PAGAMENTO',
        audioUrl: 'https://cdn.example.com/audio1.mp3',
        audioFiles: ['https://cdn.example.com/audio1.mp3', 'https://cdn.example.com/audio2.mp3']
      }
    };
    mockUpdates = {};
  });

  it('salva a versao 2 via trackIndex com sucesso', async () => {
    const req = new Request('http://localhost/api/homenagem/choose-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'order-1',
        trackIndex: 1
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.homenagemMusicaUrl).toBe('https://cdn.example.com/audio2.mp3');
    expect(mockUpdates['order-1'].homenagemMusicaUrl).toBe('https://cdn.example.com/audio2.mp3');
  });

  it('salva a versao 2 via audioUrl e trackIndex mesmo se orderId for orderNumber', async () => {
    // Permite buscar por orderNumber mas grava no id do pedido
    mockOrders['NS-100-2026'] = mockOrders['order-1'];

    const req = new Request('http://localhost/api/homenagem/choose-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'NS-100-2026',
        audioUrl: 'https://cdn.example.com/audio2.mp3',
        trackIndex: 1
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(mockUpdates['order-1'].homenagemMusicaUrl).toBe('https://cdn.example.com/audio2.mp3');
  });

  it('rejeita pedido nao pago com 403', async () => {
    const req = new Request('http://localhost/api/homenagem/choose-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'order-unpaid',
        trackIndex: 0
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejeita pedido inexistente com 404', async () => {
    const req = new Request('http://localhost/api/homenagem/choose-music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'order-nao-existe',
        trackIndex: 0
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });
});
