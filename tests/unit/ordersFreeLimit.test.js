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
  it('não bloqueia quando há menos de 5 pedidos', async () => {
    phoneMatches = [{ orderNumber: '1' }, { orderNumber: '2' }];
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('bloqueia com 5+ pedidos e nenhum pago', async () => {
    phoneMatches = Array.from({ length: 5 }, (_, i) => ({ orderNumber: String(i), paymentStatus: 'AGUARDANDO_PAGAMENTO' }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(true);
  });

  // Desde 25/09/2026 uma compra nao e passe livre: ela soma 5 a cota (ver cotaGeracoes.test.js).
  // Com 6 pedidos e 1 pago, a cota e 10 — por isso ainda nao bloqueia.
  it('não bloqueia com 6 pedidos quando um deles foi pago (cota vira 10)', async () => {
    phoneMatches = Array.from({ length: 6 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
    }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('deduplica pedidos encontrados tanto por telefone quanto por e-mail', async () => {
    const shared = { orderNumber: 'shared-1' };
    phoneMatches = [shared, { orderNumber: 'p2' }, { orderNumber: 'p3' }];
    emailMatches = [shared, { orderNumber: 'e2' }, { orderNumber: 'e3' }];
    // total único: shared, p2, p3, e2, e3 = 5
    const blocked = await isBlockedByFreeLimit('11999999999', 'cliente@example.com');
    expect(blocked).toBe(true);
  });

  it('ignora telefone/e-mail vazios ou inválidos sem lançar exceção', async () => {
    const blocked = await isBlockedByFreeLimit('', '');
    expect(blocked).toBe(false);
  });
});
