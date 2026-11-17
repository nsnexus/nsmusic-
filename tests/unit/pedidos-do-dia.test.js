import { describe, expect, it } from 'vitest';
import { buscarPedidosDoDia } from '../../src/lib/pedidosRelatorio.js';

describe('buscarPedidosDoDia', () => {
  it('filtra no banco por criado ou pago hoje (inclui add-ons do extras)', async () => {
    const chamadas = [];
    const supabase = {
      from: () => {
        const q = {
          select: () => q,
          gte: (c, v) => { chamadas.push(['gte', c, v]); return q; },
          gt: (c, v) => { chamadas.push(['gt', c, v]); return q; },
          or: (f) => { chamadas.push(['or', f]); return q; },
          is: () => q, order: () => q, limit: () => q,
          then: (res) => res({ data: [{ id: 'a', created_at: '2026-11-17T12:00:00Z', payment_status: 'PAGO', extras: {} }], error: null }),
        };
        return q;
      },
    };
    const r = await buscarPedidosDoDia(supabase, '2026-11-17T03:00:00.000Z', '2026-11-01T00:00:00-03:00');
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('a');
    const or = chamadas.find((c) => c[0] === 'or')[1];
    expect(or).toContain('created_at.gte."2026-11-17T03:00:00.000Z"');
    expect(or).toContain('paid_at.gte.');
    expect(or).toContain('extras->>videoPaidAt.gte.');
    expect(chamadas).toContainEqual(['gte', 'created_at', '2026-11-01T00:00:00-03:00']);
  });
});
