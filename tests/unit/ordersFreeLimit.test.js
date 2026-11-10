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
  it('não bloqueia quem gerou menos de 5 músicas (ex: 2 pedidos não pagos)', async () => {
    phoneMatches = [{ orderNumber: '1' }, { orderNumber: '2' }];
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('bloqueia automaticamente quem atingiu 5 pedidos sem pagamento', async () => {
    phoneMatches = Array.from({ length: 5 }, (_, i) => ({ orderNumber: String(i), paymentStatus: 'AGUARDANDO_PAGAMENTO' }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(true);
  });

  it('não bloqueia quem tem 6 pedidos onde 1 foi pago (cota ampliada para 10)', async () => {
    phoneMatches = Array.from({ length: 6 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
    }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('bloqueia quem tem 10 pedidos e apenas 1 foi pago (cota ampliada de 10 esgotada)', async () => {
    phoneMatches = Array.from({ length: 10 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGO' : 'AGUARDANDO_PAGAMENTO',
    }));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(true);
  });

  it('soma pedidos de telefone e e-mail sem duplicar pedidos compartilhados', async () => {
    const shared = { orderNumber: 'shared-1' };
    phoneMatches = [shared, { orderNumber: 'p2' }, { orderNumber: 'p3' }];
    emailMatches = [shared, { orderNumber: 'e2' }, { orderNumber: 'e3' }]; // Total: 5 únicos não pagos
    const blocked = await isBlockedByFreeLimit('11999999999', 'cliente@example.com');
    expect(blocked).toBe(true);
  });

  it('ignora telefone/e-mail vazios ou inválidos sem lançar exceção', async () => {
    const blocked = await isBlockedByFreeLimit('', '');
    expect(blocked).toBe(false);
  });
});
