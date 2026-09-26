import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// As ferramentas do atendente de WhatsApp tocam nas duas coisas que não podem dar errado: dinheiro
// (liberar pedido) e crédito da Kie.ai (regerar música). O que estes testes fixam é justamente o
// que NÃO pode acontecer — liberar por alegação do cliente, e regerar sem limite.

const getChargeStatusMock = vi.fn();
const applyPaymentApprovalMock = vi.fn();
const requestSunoGenerationMock = vi.fn();
const updateDocMock = vi.fn();

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _c, id) => ({ id }),
  getDoc: async (ref) => ({ exists: () => true, data: () => ({ id: ref.id, musicStyle: 'sertanejo', lyrics: '[Verse]\nalgo' }) }),
  updateDoc: (...args) => updateDocMock(...args),
}));
vi.mock('@/lib/efi', () => ({ getChargeStatus: (...a) => getChargeStatusMock(...a) }));
vi.mock('@/lib/payments', () => ({ applyPaymentApproval: (...a) => applyPaymentApprovalMock(...a) }));
vi.mock('@/lib/orderLookup', () => ({ findRecentOrderByPhone: async () => null }));
vi.mock('@/lib/suno.js', () => ({ requestSunoGeneration: (...a) => requestSunoGenerationMock(...a) }));
vi.mock('@/lib/sunoPayload.js', () => ({ buildSunoPayload: () => ({ prompt: 'p', tags: 't' }) }));

const { conferirPagamento, regerarMusica, montarLinksDaMusica, MAX_REGERACOES_PELO_BOT } = await import('@/lib/agentTools');

beforeEach(() => {
  getChargeStatusMock.mockReset();
  applyPaymentApprovalMock.mockReset();
  requestSunoGenerationMock.mockReset();
  updateDocMock.mockReset();
});
afterEach(() => { vi.restoreAllMocks(); });

describe('conferirPagamento', () => {
  const pedido = { id: 'ped1', paymentIntentId: 'TXID123', paymentStatus: 'AGUARDANDO_PAGAMENTO' };

  it('NÃO libera nada quando a Efí diz que não está pago', async () => {
    getChargeStatusMock.mockResolvedValue({ status: 'ATIVA' });

    const r = await conferirPagamento(pedido, {});

    expect(r.estado).toBe('ainda_nao_pago');
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('libera pelo valor CONFIRMADO na Efí, nunca pelo que o cliente disse', async () => {
    getChargeStatusMock.mockResolvedValue({ status: 'CONCLUIDA', valor: { original: '16.89' } });
    applyPaymentApprovalMock.mockResolvedValue({ applied: true });

    const r = await conferirPagamento(pedido, {});

    expect(r.estado).toBe('liberado_agora');
    expect(applyPaymentApprovalMock).toHaveBeenCalledWith('ped1', 'TXID123', { status: 'approved', transaction_amount: 16.89 }, {});
  });

  it('pedido sem cobrança gerada não vira liberação', async () => {
    const r = await conferirPagamento({ id: 'ped2', paymentStatus: 'AGUARDANDO_PAGAMENTO' }, {});
    expect(r.estado).toBe('sem_cobranca');
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('Efí fora do ar não libera por engano', async () => {
    getChargeStatusMock.mockRejectedValue(new Error('timeout'));
    const r = await conferirPagamento(pedido, {});
    expect(r.ok).toBe(false);
    expect(applyPaymentApprovalMock).not.toHaveBeenCalled();
  });

  it('pedido já pago devolve o link sem consultar de novo', async () => {
    const r = await conferirPagamento({ id: 'ped3', paymentStatus: 'PAGAMENTO_APROVADO' }, {});
    expect(r.estado).toBe('ja_estava_pago');
    expect(getChargeStatusMock).not.toHaveBeenCalled();
  });
});

describe('regerarMusica', () => {
  it('gera e conta a regeração', async () => {
    requestSunoGenerationMock.mockResolvedValue({ ok: true, taskId: 't1' });

    const r = await regerarMusica({ id: 'ped1', regeracoesPeloBot: 0 }, { novoEstilo: 'pagode' }, {});

    expect(r.ok).toBe(true);
    expect(requestSunoGenerationMock).toHaveBeenCalled();
    const gravou = updateDocMock.mock.calls.some(([, dados]) => dados.regeracoesPeloBot === 1);
    expect(gravou).toBe(true);
  });

  it('recusa depois do limite — cada geração custa crédito e acontece antes de pagar', async () => {
    const r = await regerarMusica({ id: 'ped1', regeracoesPeloBot: MAX_REGERACOES_PELO_BOT }, { novoEstilo: 'rock' }, {});

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('limite_de_regeracoes');
    expect(requestSunoGenerationMock).not.toHaveBeenCalled();
  });
});

describe('montarLinksDaMusica', () => {
  it('avisa quando ainda não há música, sem inventar link de download', () => {
    const r = montarLinksDaMusica({ id: 'ped1', audioFiles: [] });
    expect(r.temMusica).toBe(false);
    expect(r.downloads).toBeUndefined();
  });

  it('monta um download por faixa', () => {
    const r = montarLinksDaMusica({ id: 'ped1', honoreeName: 'Maria', audioFiles: ['https://cdn/a.mp3', 'https://cdn/b.mp3'] });
    expect(r.temMusica).toBe(true);
    expect(r.downloads).toHaveLength(2);
  });
});
