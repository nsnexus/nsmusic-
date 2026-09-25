import { describe, it, expect, vi, beforeEach } from 'vitest';

// A consolidação é o que faz o faturamento sobreviver à limpeza de pedidos (api/orders/cleanup
// apaga o pedido de verdade depois de 10 dias). Se ela contar errado, o número não tem como ser
// reconstruído — o pedido não existe mais.

let store;
let colecoesUsadas;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, collection, id) => { colecoesUsadas.push(collection); return { id }; },
  // increment é representado por um marcador para o mock somar como o Firestore faria.
  increment: (n) => ({ __increment: n }),
  setDoc: async (ref, data) => {
    const current = store[ref.id] || {};
    const merged = { ...current };
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && '__increment' in value) {
        merged[key] = (current[key] || 0) + value.__increment;
      } else {
        merged[key] = value;
      }
    }
    store[ref.id] = merged;
  },
}));

const { consolidateOrders, buildOrderMetrics, statsDayKey } = await import('@/lib/stats');

beforeEach(() => {
  store = {};
  colecoesUsadas = [];
});

describe('statsDayKey', () => {
  it('extrai AAAA-MM-DD de string ISO', () => {
    expect(statsDayKey('2026-08-28T19:58:08.183Z')).toBe('2026-08-28');
  });

  it('aceita Firestore Timestamp (toDate) e epoch, formatos que convivem na base', () => {
    const ts = { toDate: () => new Date('2026-08-27T10:00:00.000Z') };
    expect(statsDayKey(ts)).toBe('2026-08-27');
    expect(statsDayKey(Date.parse('2026-08-26T10:00:00.000Z'))).toBe('2026-08-26');
  });

  it('retorna vazio para entrada ausente', () => {
    expect(statsDayKey(null)).toBe('');
    expect(statsDayKey(undefined)).toBe('');
  });
});

describe('buildOrderMetrics', () => {
  it('pedido gerado mas NÃO pago: conta geração, não conta receita', () => {
    const m = buildOrderMetrics({
      audioUrl: 'https://cdn/x.mp3',
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      expectedAmount: 9.99,
    });
    expect(m.musicsGenerated).toBe(1);
    expect(m.musicsPaid).toBe(0);
    expect(m.revenue).toBe(0);
  });

  it('PAGO e PAGAMENTO_APROVADO são equivalentes (convenção do CLAUDE.md)', () => {
    expect(buildOrderMetrics({ paymentStatus: 'PAGO', expectedAmount: 9.99 }).musicsPaid).toBe(1);
    expect(buildOrderMetrics({ paymentStatus: 'PAGAMENTO_APROVADO', expectedAmount: 9.99 }).musicsPaid).toBe(1);
  });

  it('conta add-ons de vídeo e playback separadamente da música', () => {
    const m = buildOrderMetrics({
      paymentStatus: 'PAGAMENTO_APROVADO',
      expectedAmount: 9.99,
      videoAddonPaid: true,
      playbackAddonPaid: true,
    });
    expect(m.videosPaid).toBe(1);
    expect(m.playbacksPaid).toBe(1);
    expect(m.musicsPaid).toBe(1);
  });

  it('receita vem de expectedAmount (valor do catálogo gravado na cobrança), nunca de campo do cliente', () => {
    // totalPrice é um campo que o cliente já enviou no passado — não pode virar faturamento.
    const m = buildOrderMetrics({ paymentStatus: 'PAGO', expectedAmount: 16.89, totalPrice: 999 });
    expect(m.revenue).toBe(16.89);
  });

  it('audioFiles sem audioUrl ainda conta como música gerada', () => {
    expect(buildOrderMetrics({ audioFiles: ['https://cdn/a.mp3'] }).musicsGenerated).toBe(1);
    expect(buildOrderMetrics({ audioFiles: [] }).musicsGenerated).toBe(0);
  });
});

describe('consolidateOrders', () => {
  it('agrupa por dia de criação e grava também o acumulado', async () => {
    await consolidateOrders([
      { createdAt: '2026-08-27T10:00:00.000Z', paymentStatus: 'PAGO', expectedAmount: 9.99, audioUrl: 'x' },
      { createdAt: '2026-08-27T20:00:00.000Z', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioUrl: 'y' },
      { createdAt: '2026-08-28T09:00:00.000Z', paymentStatus: 'PAGO', expectedAmount: 16.89, videoAddonPaid: true },
    ]);

    expect(store['config_stats_2026-08-27'].ordersCreated).toBe(2);
    expect(store['config_stats_2026-08-27'].musicsPaid).toBe(1);
    expect(store['config_stats_2026-08-27'].revenue).toBe(9.99);

    expect(store['config_stats_2026-08-28'].ordersCreated).toBe(1);
    expect(store['config_stats_2026-08-28'].videosPaid).toBe(1);

    expect(store['config_stats_totals'].ordersCreated).toBe(3);
    expect(store['config_stats_totals'].musicsPaid).toBe(2);
    expect(store['config_stats_totals'].revenue).toBeCloseTo(26.88, 2);
  });

  it('acumula entre execuções em vez de sobrescrever (o pedido apagado não volta pra recontar)', async () => {
    await consolidateOrders([{ createdAt: '2026-08-27T10:00:00.000Z', paymentStatus: 'PAGO', expectedAmount: 9.99 }]);
    await consolidateOrders([{ createdAt: '2026-08-27T11:00:00.000Z', paymentStatus: 'PAGO', expectedAmount: 9.99 }]);

    expect(store['config_stats_2026-08-27'].ordersCreated).toBe(2);
    expect(store['config_stats_2026-08-27'].revenue).toBeCloseTo(19.98, 2);
    expect(store['config_stats_totals'].ordersCreated).toBe(2);
  });

  it('lista vazia não escreve nada', async () => {
    const res = await consolidateOrders([]);
    expect(res.consolidated).toBe(0);
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('pedido sem createdAt vai para o balde "sem-data" em vez de ser descartado', async () => {
    await consolidateOrders([{ paymentStatus: 'PAGO', expectedAmount: 9.99 }]);
    expect(store['config_stats_sem-data'].ordersCreated).toBe(1);
    expect(store['config_stats_totals'].revenue).toBe(9.99);
  });

  // Não é preferência de nomenclatura: as regras do Firestore em produção NEGAM escrita na coleção
  // `stats` (403 PERMISSION_DENIED, medido em 03/09 e de novo em 25/09/2026) e o projeto não tem
  // Admin SDK. Enquanto isso valer, escrever em `stats` faz a consolidação falhar — e a limpeza
  // aborta quando a consolidação falha, então nenhum pedido antigo era apagado.
  it('escreve na coleção gravável, nunca na coleção stats', async () => {
    await consolidateOrders([{ createdAt: '2026-08-27T10:00:00.000Z', paymentStatus: 'PAGO', expectedAmount: 9.99 }]);
    expect(colecoesUsadas).not.toContain('stats');
    expect(new Set(colecoesUsadas)).toEqual(new Set(['orders']));
  });
});
