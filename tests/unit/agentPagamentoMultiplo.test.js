import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Dois comportamentos pedidos pelo dono do estúdio em 26/09/2026, ambos sobre não deixar dinheiro
// e entrega pela metade:
//   1. conferir TODAS as cobranças do pedido, não só a atual — trocar de faixa na escada gera um
//      Pix novo e o cliente costuma pagar o que já estava aberto no celular;
//   2. listar TODAS as músicas pagas do cliente, não só a última.

const getChargeStatusMock = vi.fn();
const applyPaymentApprovalMock = vi.fn();
const findOrdersByPhoneMock = vi.fn();

vi.mock('@/lib/supabaseDb', () => ({ getOrder: async () => null, updateOrder: async () => ({}) }));
vi.mock('@/lib/efi', () => ({ getChargeStatus: (...a) => getChargeStatusMock(...a) }));
vi.mock('@/lib/payments', () => ({ applyPaymentApproval: (...a) => applyPaymentApprovalMock(...a) }));
vi.mock('@/lib/orderLookup.js', () => ({
  findRecentOrderByPhone: async () => null,
  findOrdersByPhone: (...a) => findOrdersByPhoneMock(...a),
}));

const { conferirPagamento, listarMusicasPagas } = await import('@/lib/agentTools');

beforeEach(() => {
  getChargeStatusMock.mockReset();
  applyPaymentApprovalMock.mockReset();
  findOrdersByPhoneMock.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('conferirPagamento com cobranças anteriores', () => {
  const pedido = {
    id: 'ped1',
    paymentStatus: 'AGUARDANDO_PAGAMENTO',
    paymentIntentId: 'TXID_NOVO',
    previousPaymentIntentIds: ['TXID_ANTIGO'],
  };

  it('encontra o pagamento feito na cobrança ANTIGA', async () => {
    getChargeStatusMock.mockImplementation(async (txid) => (
      txid === 'TXID_ANTIGO'
        ? { status: 'CONCLUIDA', valor: { original: '9.99' } }
        : { status: 'ATIVA' }
    ));
    applyPaymentApprovalMock.mockResolvedValue({ applied: true });

    const r = await conferirPagamento(pedido, {});

    expect(r.estado).toBe('liberado_agora');
    // Libera usando o txid que foi REALMENTE pago, nunca o atual.
    expect(applyPaymentApprovalMock).toHaveBeenCalledWith('ped1', 'TXID_ANTIGO', expect.objectContaining({ transaction_amount: 9.99 }), {});
  });

  it('nenhuma cobrança paga continua sendo "ainda não pago"', async () => {
    getChargeStatusMock.mockResolvedValue({ status: 'ATIVA' });

    const r = await conferirPagamento(pedido, {});

    expect(r.estado).toBe('ainda_nao_pago');
    expect(r.cobrancasConferidas).toBe(2); // as duas responderam, nenhuma paga
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('erro numa cobrança não impede conferir as outras', async () => {
    getChargeStatusMock.mockImplementation(async (txid) => {
      if (txid === 'TXID_NOVO') throw new Error('timeout');
      return { status: 'CONCLUIDA', valor: { original: '16.89' } };
    });
    applyPaymentApprovalMock.mockResolvedValue({ applied: true });

    const r = await conferirPagamento(pedido, {});
    expect(r.estado).toBe('liberado_agora');
  });
  it('Efi inteira fora do ar nao vira "nao pago"', async () => {
    getChargeStatusMock.mockRejectedValue(new Error('timeout'));

    const r = await conferirPagamento(pedido, {});

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('consulta_indisponivel');
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });
});

describe('listarMusicasPagas', () => {
  it('devolve só os pedidos pagos E com áudio', async () => {
    findOrdersByPhoneMock.mockResolvedValue([
      { id: 'a', orderNumber: 'NS-A', honoreeName: 'Maria', paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['u1'] },
      { id: 'b', orderNumber: 'NS-B', honoreeName: 'João', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['u2'] },
      { id: 'c', orderNumber: 'NS-C', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: [] },
      { id: 'd', orderNumber: 'NS-D', honoreeName: 'Léo', paymentStatus: 'PAGO', audioUrl: 'u4' },
    ]);

    const lista = await listarMusicasPagas('5511999999999', {});

    expect(lista.map((m) => m.orderId)).toEqual(['a', 'd']);
    expect(lista[0].link).toContain('a');
    expect(lista[0].homenageado).toBe('Maria');
  });

  it('cliente sem música paga devolve lista vazia', async () => {
    findOrdersByPhoneMock.mockResolvedValue([
      { id: 'x', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['u'] },
    ]);
    expect(await listarMusicasPagas('5511999999999', {})).toEqual([]);
  });
});
