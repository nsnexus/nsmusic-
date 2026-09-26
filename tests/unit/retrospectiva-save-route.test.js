import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockOrders = {};

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: async (id) => mockOrders[id] || null,
  updateOrder: async (id, data) => {
    mockOrders[id] = { ...(mockOrders[id] || {}), ...data };
    return mockOrders[id];
  }
}));

const { POST } = await import('@/app/api/retrospectiva/save/route');

describe('POST /api/retrospectiva/save', () => {
  beforeEach(() => {
    mockOrders = {
      'order-liberado': {
        id: 'order-liberado',
        hasRetrospectivaAccess: true,
        customerName: 'Cliente Teste'
      },
      'order-bloqueado': {
        id: 'order-bloqueado',
        hasRetrospectivaAccess: false,
        retrospectivaAddonPaid: false
      }
    };
  });

  it('rejeita requisições sem orderId ou retrospectiva com 400', async () => {
    const reqSemId = new Request('http://localhost/api/retrospectiva/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ retrospectiva: {} })
    });
    const resSemId = await POST(reqSemId);
    expect(resSemId.status).toBe(400);

    const reqSemConteudo = new Request('http://localhost/api/retrospectiva/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'order-123' })
    });
    const resSemConteudo = await POST(reqSemConteudo);
    expect(resSemConteudo.status).toBe(400);
  });

  it('rejeita pedidos inexistentes com 404', async () => {
    const req = new Request('http://localhost/api/retrospectiva/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'inexistente', retrospectiva: { titulo: 'Teste' } })
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('rejeita pedidos sem acesso comprado com 403', async () => {
    const req = new Request('http://localhost/api/retrospectiva/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: 'order-bloqueado', retrospectiva: { titulo: 'Teste' } })
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('aceita e sanitiza fotos tanto do Cloudflare R2 quanto legadas, gravando no Supabase', async () => {
    const r2Url = 'https://media.nsnexus.com.br/retrospectiva/order-liberado/123_abc.jpg';
    const legacyUrl = 'https://firebasestorage.googleapis.com/v0/b/nsmusic.appspot.com/o/foto.jpg?alt=media';
    const invalidUrl = 'https://site-malicioso.com/imagem.jpg';

    const req = new Request('http://localhost/api/retrospectiva/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: 'order-liberado',
        retrospectiva: {
          titulo: 'Nossa História',
          contadorLabel: 'Casados há',
          dataInicio: '2020-05-15',
          fotos: [r2Url, legacyUrl, invalidUrl],
          momentos: [
            { titulo: 'Primeiro Beijo', texto: 'Inesquecível', data: '2020-05-15', fotoUrl: r2Url },
            { titulo: 'Viagem', texto: 'Praia', data: '2021-01-10', fotoUrl: invalidUrl }
          ],
          quiz: [
            { pergunta: 'Onde nos conhecemos?', opcoes: ['Praia', 'Cinema'], correta: 0 }
          ]
        }
      })
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    // Fotos permitidas foram mantidas; URL não autorizada foi filtrada
    expect(data.retrospectiva.fotos).toEqual([r2Url, legacyUrl]);
    expect(data.retrospectiva.momentos[0].fotoUrl).toBe(r2Url);
    expect(data.retrospectiva.momentos[1].fotoUrl).toBe('');

    // Verificação de persistência
    expect(mockOrders['order-liberado'].retrospectiva.fotos).toEqual([r2Url, legacyUrl]);
  });
});
