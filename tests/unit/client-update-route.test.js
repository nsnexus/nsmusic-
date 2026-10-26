import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(),
  updateOrder: vi.fn(),
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(() => ({ env: {} })),
}));

import { POST } from '@/app/api/orders/client-update/route';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

function createRequest(body) {
  return new Request('https://nsmusic.com.br/api/orders/client-update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/orders/client-update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejeita requisições sem orderId', async () => {
    const res = await POST(createRequest({ coverUrl: 'https://ex.com/img.jpg' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('orderId_obrigatorio');
  });

  it('retorna 404 para pedido inexistente', async () => {
    getOrder.mockResolvedValue(null);
    const res = await POST(createRequest({ orderId: 'inexistente', coverUrl: 'https://ex.com/img.jpg' }));
    expect(res.status).toBe(404);
  });

  it('NUNCA permite alterar campos sensíveis como audioUrl, audioFiles ou total', async () => {
    getOrder.mockResolvedValue({ id: 'ord-1', customerPhone: '11999999999' });
    updateOrder.mockResolvedValue({ success: true });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      audioUrl: 'https://hacker.com/fake.mp3',
      audioFiles: ['https://hacker.com/fake.mp3'],
      total: 0.01,
      package: 'gratis',
      coverUrl: 'https://r2.nsmusic.com/nova-capa.jpg'
    }));

    expect(res.status).toBe(200);
    expect(updateOrder).toHaveBeenCalledWith('ord-1', {
      coverUrl: 'https://r2.nsmusic.com/nova-capa.jpg'
    }, expect.any(Object));
  });

  it('impede sobrescrever customerPhone existente para evitar sequestro de conta via claim-code', async () => {
    getOrder.mockResolvedValue({ id: 'ord-1', customerPhone: '11988887777' });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      customerPhone: '11911112222', // tentando alterar telefone de recuperação
    }));

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe('telefone_imutavel');
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it('permite definir customerPhone inicial se o pedido ainda não possuía telefone', async () => {
    getOrder.mockResolvedValue({ id: 'ord-1', customerPhone: null });
    updateOrder.mockResolvedValue({ success: true });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      customerPhone: '11988887777',
    }));

    expect(res.status).toBe(200);
    expect(updateOrder).toHaveBeenCalledWith('ord-1', {
      customerPhone: '11988887777',
    }, expect.any(Object));
  });

  it('permite completar customerPhone quando o telefone anterior estava incompleto (< 11 dígitos)', async () => {
    getOrder.mockResolvedValue({ id: 'ord-1', customerPhone: '(11) 9888-8777' }); // 10 dígitos gravados durante a digitação
    updateOrder.mockResolvedValue({ success: true });

    const res = await POST(createRequest({
      orderId: 'ord-1',
      customerPhone: '(11) 98888-7777', // 11 dígitos completados
    }));

    expect(res.status).toBe(200);
    expect(updateOrder).toHaveBeenCalledWith('ord-1', {
      customerPhone: '(11) 98888-7777',
    }, expect.any(Object));
  });
});
