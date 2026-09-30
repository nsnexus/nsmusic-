import { describe, it, expect, vi, beforeEach } from 'vitest';

// A-11 no AUDIT_REPORT.md: o limite de 5 músicas grátis só existia no cliente
// (criar/page.jsx:checkUserLimit) — chamar /api/orders/create direto ignorava o limite.
// isBlockedByFreeLimit é o reforço server-side, aplicado antes de criar o pedido.

let phoneMatches;
let emailMatches;

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null })
        }),
        is: () => ({
          or: async () => {
            const all = [...phoneMatches, ...emailMatches];
            const unique = [];
            const seen = new Set();
            for (const item of all) {
              if (!seen.has(item.orderNumber)) {
                seen.add(item.orderNumber);
                unique.push({
                  order_number: item.orderNumber,
                  payment_status: item.paymentStatus || 'AGUARDANDO_PAGAMENTO',
                  created_at: item.createdAt || new Date().toISOString()
                });
              }
            }
            return { data: unique, error: null };
          }
        })
      })
    })
  }))
}));

const { isBlockedByFreeLimit } = await import('@/app/api/orders/create/route');

beforeEach(() => {
  phoneMatches = [];
  emailMatches = [];
});

describe('isBlockedByFreeLimit', () => {
  it('não bloqueia automaticamente por cota (bloqueio 100% manual via blacklist do admin)', async () => {
    phoneMatches = [{ orderNumber: '1' }, { orderNumber: '2' }];
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('não bloqueia mesmo com 5+ pedidos não pagos', async () => {
    phoneMatches = Array.from({ length: 5 }, (_, i) => ({ orderNumber: String(i), paymentStatus: 'AGUARDANDO_PAGAMENTO' }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('não bloqueia com compras ou sem compras', async () => {
    phoneMatches = Array.from({ length: 6 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
    }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('retorna false para qualquer combinação de telefone/e-mail', async () => {
    const shared = { orderNumber: 'shared-1' };
    phoneMatches = [shared, { orderNumber: 'p2' }, { orderNumber: 'p3' }];
    emailMatches = [shared, { orderNumber: 'e2' }, { orderNumber: 'e3' }];
    const blocked = await isBlockedByFreeLimit('11999999999', 'cliente@example.com');
    expect(blocked).toBe(false);
  });

  it('ignora telefone/e-mail vazios ou inválidos sem lançar exceção', async () => {
    const blocked = await isBlockedByFreeLimit('', '');
    expect(blocked).toBe(false);
  });
});
