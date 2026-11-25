import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ajuste pago (R$ 1) pelo chat de suporte: a aprovação só executa o que o servidor gravou como
// pendente, uma única vez, e nunca mexe em paymentStatus.

let store;

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => (store[id] ? { id, ...store[id] } : null)),
  updateOrder: vi.fn(async (id, data) => {
    store[id] = { ...(store[id] || {}), ...data };
    return { success: true };
  }),
}));

const { aplicarAjustePago, limparEstilo } = await import('@/lib/ajustePago');
const { applyPaymentApproval } = await import('@/lib/payments');

function deps(overrides = {}) {
  return {
    regerarMusica: vi.fn(async () => ({ ok: true, taskId: 'task-1' })),
    reservarExecucao: vi.fn(async () => true),
    avisarDono: vi.fn(async () => {}),
    ...overrides,
  };
}

beforeEach(() => {
  store = {};
});

describe('aplicarAjustePago', () => {
  it('troca de ritmo pago: regera com o estilo gravado no pedido e tira o pendente', async () => {
    store.p1 = {
      paymentStatus: 'PAGAMENTO_APROVADO',
      ajustesPendentes: { TX1: { tipo: 'ritmo', estilo: 'Pagode' } },
    };
    const d = deps();

    const r = await aplicarAjustePago({ id: 'p1', ...store.p1 }, 'TX1', { transaction_amount: 1 }, {}, d);

    expect(r.applied).toBe(true);
    expect(d.regerarMusica).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { novoEstilo: 'Pagode', pago: true }, {});
    expect(store.p1.ajustesPendentes).toEqual({});
    expect(store.p1.ajustePaymentIds).toEqual(['TX1']);
    expect(store.p1.paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(d.avisarDono).not.toHaveBeenCalled();
  });

  it('letra paga: grava a letra aprovada antes de regerar', async () => {
    const letra = '[Verse]\n'.padEnd(80, 'la ');
    store.p2 = { paymentStatus: 'PAGO', lyrics: 'antiga', ajustesPendentes: { TX2: { tipo: 'letra', letra } } };
    const d = deps();

    await aplicarAjustePago({ id: 'p2', ...store.p2 }, 'TX2', { transaction_amount: 1 }, {}, d);

    expect(store.p2.lyrics).toBe(letra);
    expect(d.regerarMusica.mock.calls[0][0].lyrics).toBe(letra);
    expect(d.regerarMusica.mock.calls[0][1]).toEqual({ novoEstilo: null, pago: true });
  });

  it('não executa duas vezes o mesmo txid', async () => {
    store.p3 = { ajustePaymentIds: ['TX3'], ajustesPendentes: {} };
    const d = deps();

    const r = await aplicarAjustePago({ id: 'p3', ...store.p3 }, 'tx3', { transaction_amount: 1 }, {}, d);

    expect(r).toMatchObject({ applied: false, reason: 'already_processed' });
    expect(d.regerarMusica).not.toHaveBeenCalled();
  });

  it('webhook e polling juntos: quem perde a reserva não regera', async () => {
    store.p4 = { ajustesPendentes: { TX4: { tipo: 'ritmo', estilo: 'Forró' } } };
    const d = deps({ reservarExecucao: vi.fn(async () => false) });

    const r = await aplicarAjustePago({ id: 'p4', ...store.p4 }, 'TX4', { transaction_amount: 1 }, {}, d);

    expect(r).toMatchObject({ applied: false, reason: 'already_processed' });
    expect(d.regerarMusica).not.toHaveBeenCalled();
  });

  it('valor abaixo do preço não aplica', async () => {
    store.p5 = { ajustesPendentes: { TX5: { tipo: 'ritmo', estilo: 'Rock' } } };
    const d = deps();

    const r = await aplicarAjustePago({ id: 'p5', ...store.p5 }, 'TX5', { transaction_amount: 0.5 }, {}, d);

    expect(r).toMatchObject({ applied: false, reason: 'valor_divergente' });
    expect(d.reservarExecucao).not.toHaveBeenCalled();
  });

  it('falha ao regerar avisa o dono e registra o pagamento', async () => {
    store.p6 = { ajustesPendentes: { TX6: { tipo: 'ritmo', estilo: 'Gospel' } } };
    const d = deps({ regerarMusica: vi.fn(async () => ({ ok: false, motivo: 'falha_na_geracao' })) });

    const r = await aplicarAjustePago({ id: 'p6', ...store.p6 }, 'TX6', { transaction_amount: 1 }, {}, d);

    expect(r.applied).toBe(true);
    expect(r.ajuste.ok).toBe(false);
    expect(store.p6.ajustePaymentIds).toEqual(['TX6']);
    expect(d.avisarDono).toHaveBeenCalledTimes(1);
  });
});

describe('applyPaymentApproval com SKU ajuste_musica', () => {
  it('não escreve paymentStatus nem paymentId do pedido', async () => {
    store.p7 = {
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      paymentIntentSkuByTxid: { TX7: 'ajuste_musica' },
      ajustePaymentIds: ['TX7'],
    };

    const r = await applyPaymentApproval('p7', 'TX7', { status: 'approved', transaction_amount: 1 });

    expect(r).toMatchObject({ applied: false, reason: 'already_processed', sku: 'ajuste_musica' });
    expect(store.p7.paymentStatus).toBe('AGUARDANDO_PAGAMENTO');
    expect(store.p7.paymentId).toBeUndefined();
  });
});

describe('limparEstilo', () => {
  it('corta símbolos e tamanho', () => {
    expect(limparEstilo('  <b>Sertanejo</b> universitário!!! ')).toBe('b Sertanejo b universitário');
    expect(limparEstilo('x'.repeat(100))).toHaveLength(40);
  });
});
