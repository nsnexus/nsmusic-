import { describe, it, expect, vi, beforeEach } from 'vitest';

let dbOrders = [];
let isBlockedContact = false;
let pacotes = [];

vi.mock('@/lib/blocklist', () => ({
  isContactBlocked: vi.fn(async () => ({ blocked: isBlockedContact, reason: isBlockedContact ? 'manual_block' : null })),
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: () => ({
        in: () => {
          const query = {
            in: () => query,
            is: () => query,
            filter: (column, operator, value) => {
              expect([column, operator, value]).toEqual(['extras->>geracoesExtras', 'not.is', null]);
              return query;
            },
            order: () => query,
            limit: async () => ({ data: pacotes, error: null }),
          };
          return query;
        },
        eq: () => ({
          maybeSingle: async () => ({ data: null })
        }),
        is: () => ({
          or: async () => ({
            data: dbOrders.map(o => ({
              order_number: o.orderNumber,
              payment_status: o.paymentStatus || 'AGUARDANDO_PAGAMENTO',
              created_at: o.createdAt || new Date().toISOString()
            })),
            error: null
          })
        })
      })
    })
  }))
}));

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: {} }),
}));

const { GET } = await import('@/app/api/orders/check-limit/route');

beforeEach(() => {
  dbOrders = [];
  isBlockedContact = false;
  pacotes = [];
});

describe('GET /api/orders/check-limit', () => {
  it('retorna não-bloqueado com cota inicial quando não há telefone nem e-mail', async () => {
    const req = new Request('https://nsmusic.com.br/api/orders/check-limit');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isBlocked).toBe(false);
    expect(data.cota).toBe(5);
    expect(data.restantes).toBe(5);
  });

  it('retorna manualBlock: true se o contato estiver na blacklist', async () => {
    isBlockedContact = true;
    const req = new Request('https://nsmusic.com.br/api/orders/check-limit?phone=11999999999');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isBlocked).toBe(true);
    expect(data.manualBlock).toBe(true);
  });

  it('não bloqueia usuário com 5 pedidos onde 3 foram pagos (cota de 20)', async () => {
    dbOrders = [
      { orderNumber: '1', paymentStatus: 'PAGAMENTO_APROVADO' },
      { orderNumber: '2', paymentStatus: 'PAGAMENTO_APROVADO' },
      { orderNumber: '3', paymentStatus: 'PAGAMENTO_APROVADO' },
      { orderNumber: '4', paymentStatus: 'AGUARDANDO_PAGAMENTO' },
      { orderNumber: '5', paymentStatus: 'AGUARDANDO_PAGAMENTO' },
    ];
    const req = new Request('https://nsmusic.com.br/api/orders/check-limit?phone=(14)%2099879-8883');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isBlocked).toBe(false);
    expect(data.totalCount).toBe(5);
    expect(data.pagos).toBe(3);
    expect(data.cota).toBe(20);
    expect(data.restantes).toBe(15);
  });

  it('bloqueia automaticamente usuário com 5 pedidos gratuitos sem pagamento (cota esgotada)', async () => {
    dbOrders = Array.from({ length: 5 }, (_, i) => ({
      orderNumber: `free-${i}`,
      paymentStatus: 'AGUARDANDO_PAGAMENTO'
    }));
    const req = new Request('https://nsmusic.com.br/api/orders/check-limit?phone=11988887777');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isBlocked).toBe(true);
    expect(data.totalCount).toBe(5);
    expect(data.pagos).toBe(0);
    expect(data.restantes).toBe(0);
    expect(data.reason).toBe('cota_excedida');
    expect(data.manualBlock).toBe(false);
  });

  it('permite avançar com a cota comum esgotada se o cliente tem saldo no Pacote Família', async () => {
    pacotes = [{ id: 'familia', payment_status: 'PAGAMENTO_APROVADO', extras: { geracoesExtras: 10 } }];
    dbOrders = [
      { orderNumber: 'familia', paymentStatus: 'PAGAMENTO_APROVADO' },
      ...Array.from({ length: 9 }, (_, i) => ({ orderNumber: `free-${i}` })),
    ];

    const req = new Request('https://nsmusic.com.br/api/orders/check-limit?phone=11988887777');
    const data = await (await GET(req)).json();
    expect(data).toMatchObject({ isBlocked: false, restantes: 0, reason: null });

    isBlockedContact = true;
    const blocked = await (await GET(req)).json();
    expect(blocked).toMatchObject({ isBlocked: true, manualBlock: true, reason: 'manual_block' });
  });
});
