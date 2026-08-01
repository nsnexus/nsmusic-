import { describe, it, expect, vi, beforeEach } from 'vitest';

// A-11 no AUDIT_REPORT.md: o limite de 5 músicas grátis só existia no cliente
// (criar/page.jsx:checkUserLimit) — chamar /api/orders/create direto ignorava o limite.
// isBlockedByFreeLimit é o reforço server-side, aplicado antes de criar o pedido.

let phoneMatches;
let emailMatches;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  collection: () => ({}),
  where: (field, _op, value) => ({ field, value }),
  query: (_ref, whereClause) => whereClause,
  getDocs: async (whereClause) => {
    const docs = whereClause.field === 'customerPhone' ? phoneMatches : emailMatches;
    return { forEach: (cb) => docs.forEach((data) => cb({ data: () => data })) };
  },
  addDoc: async () => ({ id: 'mock-doc-id' }),
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

  it('não bloqueia se algum dos pedidos já foi pago, mesmo com 5+', async () => {
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
