import { describe, it, expect, vi, beforeEach } from 'vitest';

// A-11 no AUDIT_REPORT.md: o limite de 5 músicas grátis só existia no cliente
// (criar/page.jsx:checkUserLimit) — chamar /api/orders/create direto ignorava o limite.
// isBlockedByFreeLimit é o reforço server-side, aplicado antes de criar o pedido.

import { criarFakePostgrest, linhaPedido } from '../helpers/fakePostgrest.js';

// O cliente Supabase é o REAL; só o servidor (fetch) é falso. Assim o teste pega consulta que o
// PostgREST recusaria — foi isso que deixou a trava contando 0 pedidos em produção (23/11/2026).
let rows = [];
vi.mock('@/lib/supabase-edge', async () => {
  const real = await vi.importActual('@/lib/supabase-edge');
  return { ...real, getSupabaseEdge: vi.fn(() => new real.NativeSupabaseClient('https://db.test', 'chave-teste')) };
});

const { isBlockedByFreeLimit } = await import('@/app/api/orders/create/route');

beforeEach(() => {
  rows = [];
  vi.stubGlobal('fetch', criarFakePostgrest(() => rows));
});

const doTelefone = (lista, phone = '(11) 99999-9999') =>
  lista.map((p, i) => linhaPedido({ n: p.orderNumber ?? `t${i}`, phone, pago: ['PAGO', 'PAGAMENTO_APROVADO'].includes(p.paymentStatus) }));

describe('isBlockedByFreeLimit', () => {
  it('não bloqueia quem gerou menos de 5 músicas (ex: 2 pedidos não pagos)', async () => {
    rows = doTelefone([{ orderNumber: '1' }, { orderNumber: '2' }]);
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('bloqueia automaticamente quem atingiu 5 pedidos sem pagamento', async () => {
    rows = doTelefone(Array.from({ length: 5 }, (_, i) => ({ orderNumber: String(i), paymentStatus: 'AGUARDANDO_PAGAMENTO' })));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(true);
  });

  it('não bloqueia quem tem 6 pedidos onde 1 foi pago (cota ampliada para 10)', async () => {
    rows = doTelefone(Array.from({ length: 6 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGAMENTO_APROVADO' : 'AGUARDANDO_PAGAMENTO',
    })));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(false);
  });

  it('bloqueia quem tem 10 pedidos e apenas 1 foi pago (cota ampliada de 10 esgotada)', async () => {
    rows = doTelefone(Array.from({ length: 10 }, (_, i) => ({
      orderNumber: String(i),
      paymentStatus: i === 0 ? 'PAGO' : 'AGUARDANDO_PAGAMENTO',
    })));
    const blocked = await isBlockedByFreeLimit('11999999999', '');
    expect(blocked).toBe(true);
  });

  it('soma pedidos de telefone e e-mail sem duplicar pedidos compartilhados', async () => {
    // Pedido com o mesmo telefone E o mesmo e-mail aparece nas duas consultas: conta uma vez só.
    rows = [
      linhaPedido({ n: 'shared-1', phone: '(11) 99999-9999', email: 'cliente@example.com' }),
      linhaPedido({ n: 'p2', phone: '11999999999' }),
      linhaPedido({ n: 'p3', phone: '+55 11 99999-9999' }),
      linhaPedido({ n: 'e2', phone: '(21) 98888-7777', email: 'cliente@example.com' }),
      linhaPedido({ n: 'e3', email: 'cliente@example.com' }),
    ]; // Total: 5 únicos não pagos
    const blocked = await isBlockedByFreeLimit('11999999999', 'cliente@example.com');
    expect(blocked).toBe(true);
  });

  it('acha pedidos gravados em qualquer formato de telefone (com 55, sem o 9, com máscara)', async () => {
    rows = [
      linhaPedido({ n: 1, phone: '(89) 98123-2236' }),
      linhaPedido({ n: 2, phone: '89981232236' }),
      linhaPedido({ n: 3, phone: '+55 89 98123-2236' }),
      linhaPedido({ n: 4, phone: '5589981232236' }),
      linhaPedido({ n: 5, phone: '(89) 8123-2236' }),
      linhaPedido({ n: 6, phone: '(11) 91234-5678' }), // outra pessoa
    ];
    expect(await isBlockedByFreeLimit('89981232236', '')).toBe(true);
  });

  it('banco sem a coluna customer_phone_digits: usa a busca por customer_phone (plano B)', async () => {
    vi.stubGlobal('fetch', criarFakePostgrest(() => rows, { semColunaDigitos: true }));
    rows = Array.from({ length: 5 }, (_, i) => linhaPedido({ n: i, phone: i % 2 ? '(89) 98123-2236' : '89981232236' }));
    expect(await isBlockedByFreeLimit('89981232236', '')).toBe(true);
  });

  it('na geração da música, o próprio pedido não conta contra ele (5º pedido grátis gera)', async () => {
    rows = Array.from({ length: 5 }, (_, i) => linhaPedido({ n: `NS-${i}`, phone: '(11) 99999-9999' }));
    expect(await isBlockedByFreeLimit('11999999999', '')).toBe(true); // criar o 6º: bloqueia
    expect(await isBlockedByFreeLimit('11999999999', '', {}, { ignorarPedido: 'NS-4' })).toBe(false); // gerar o 5º: libera
  });

  it('não conta a 2ª geração (bônus) de pedido pago', async () => {
    rows = [
      ...Array.from({ length: 4 }, (_, i) => linhaPedido({ n: i, phone: '(11) 99999-9999' })),
      linhaPedido({ n: 'b', phone: '(11) 99999-9999', segunda: true }),
    ];
    expect(await isBlockedByFreeLimit('11999999999', '')).toBe(false);
  });

  it('ignora telefone/e-mail vazios ou inválidos sem lançar exceção', async () => {
    const blocked = await isBlockedByFreeLimit('', '');
    expect(blocked).toBe(false);
  });
});
