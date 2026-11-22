import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  order: null,
  packages: [],
  generate: vi.fn(),
  updateOrder: vi.fn(),
  findBonus: vi.fn(),
}));

vi.mock('@/lib/suno', () => ({ requestSunoGeneration: state.generate }));
vi.mock('@/lib/supabaseDb', () => ({ updateOrder: state.updateOrder }));
vi.mock('@/lib/blocklist', () => ({ isContactBlocked: async () => ({ blocked: false }) }));
vi.mock('@/app/api/orders/create/route', () => ({ isBlockedByFreeLimit: async () => false }));
vi.mock('@/lib/orderLookup', async (importOriginal) => ({
  ...await importOriginal(),
  findOrderByIdOrNumber: async () => state.order,
}));
vi.mock('@/lib/bonusAutomatico', async (importOriginal) => ({
  ...await importOriginal(),
  encontrarBonusDisponivel: state.findBonus,
}));
vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      let rows = state.packages;
      const query = {
        select: () => query,
        in(column, values) {
          rows = rows.filter((row) => values.includes(row[column]));
          return query;
        },
        eq(column, value) {
          rows = rows.filter((row) => row[column] === value);
          return query;
        },
        is: () => query,
        filter: () => query,
        order: () => query,
        limit: () => query,
        then: (resolve) => resolve({ data: rows, error: null }),
      };
      return query;
    },
  }),
}));

const { POST } = await import('@/app/api/suno/generate/route');

function pacote(id, phone = '(11) 99999-1111') {
  return {
    id,
    customer_phone: phone,
    payment_status: 'PAGAMENTO_APROVADO',
    extras: { geracoesExtras: 10 },
  };
}

function request(familiaRef) {
  return new Request('https://nsmusic.test/api/suno/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt: 'Letra de teste', tags: 'Sertanejo', orderId: 'musica', familiaRef }),
  });
}

beforeEach(() => {
  state.order = { id: 'musica', customerPhone: '5511999991111', paymentStatus: 'AGUARDANDO_PAGAMENTO' };
  state.packages = [pacote('outro'), pacote('escolhido')];
  vi.clearAllMocks();
  state.generate.mockResolvedValue({ ok: true, taskId: 'task' });
});

describe('Criação pelo Pacote Família', () => {
  it('usa o pacote selecionado mesmo com outro pacote disponível para o mesmo WhatsApp', async () => {
    const res = await POST(request('escolhido'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ taskId: 'task', geracaoExtra: true, geracoesExtrasRestantes: 9 });
    expect(state.updateOrder).toHaveBeenCalledWith('musica', expect.objectContaining({
      paymentStatus: 'PAGAMENTO_APROVADO',
      familiaOrderId: 'escolhido',
    }), {});
    expect(state.updateOrder).toHaveBeenCalledWith('escolhido', { geracoesExtrasPedidos: ['musica'] }, {});
    expect(state.findBonus).not.toHaveBeenCalled();
  });

  it('preserva o pacote associado ao pedido mesmo sem a referência no navegador', async () => {
    state.order.familiaRef = 'escolhido';
    const res = await POST(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ geracaoExtra: true });
    expect(state.updateOrder).toHaveBeenCalledWith('escolhido', { geracoesExtrasPedidos: ['musica'] }, {});
  });

  it('pede o WhatsApp da compra quando ele diverge e não inicia música avulsa', async () => {
    state.packages[1] = pacote('escolhido', '(11) 99999-2222');
    const res = await POST(request('escolhido'));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('mesmo WhatsApp da compra');
    expect(state.updateOrder).not.toHaveBeenCalled();
    expect(state.generate).not.toHaveBeenCalled();
  });
});
