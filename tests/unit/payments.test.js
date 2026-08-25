import { describe, it, expect, vi, beforeEach } from 'vitest';

// applyPaymentApproval é o ponto único de aprovação (M-18) consumido pelo webhook e pelo polling.
// Aqui validamos as garantias de segurança mais críticas do Lote 2:
//   - C-09: video_addon isolado nunca escreve paymentStatus;
//   - A-13: o SKU persistido decide o ramo, não uma heurística de valor;
//   - A-09: o mesmo paymentId não é processado duas vezes (webhook + polling concorrentes);
//   - estornos/cancelamentos revogam o acesso já concedido.

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

const sendPaymentApprovedTemplateMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/lib/whatsapp', () => ({
  sendPaymentApprovedTemplate: (...args) => sendPaymentApprovedTemplateMock(...args),
  isVideoPurchased: (orderData) => Boolean(orderData?.hasVideoAccess || orderData?.paymentIntentSku === 'combo'),
}));

vi.mock('firebase/firestore/lite', () => {
  return {
    doc: (_db, _collection, id) => ({ id }),
    getDoc: async (ref) => ({
      exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
      data: () => store[ref.id],
    }),
    updateDoc: async (ref, data) => {
      store[ref.id] = { ...(store[ref.id] || {}), ...data };
    },
    runTransaction: async (_db, updateFunction) => {
      const tx = {
        get: async (ref) => ({
          exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
          data: () => store[ref.id],
        }),
        update: (ref, data) => {
          store[ref.id] = { ...(store[ref.id] || {}), ...data };
        },
      };
      return updateFunction(tx);
    },
  };
});

const { applyPaymentApproval } = await import('@/lib/payments');

beforeEach(() => {
  store = {};
  sendPaymentApprovedTemplateMock.mockClear();
});

describe('applyPaymentApproval', () => {
  it('audio_only aprovado: escreve paymentStatus e paymentId, não mexe em hasVideoAccess', async () => {
    store['order1'] = { paymentIntentSku: 'audio_only', customerPhone: '', paymentId: null };

    const result = await applyPaymentApproval('order1', '111', { status: 'approved', transaction_amount: 9.99 });

    expect(result.applied).toBe(true);
    expect(store['order1'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(store['order1'].paymentId).toBe('111');
    expect(store['order1'].hasVideoAccess).toBeUndefined();
  });

  it('combo aprovado: escreve paymentStatus E concede hasVideoAccess', async () => {
    store['order2'] = { paymentIntentSku: 'combo', paymentId: null };

    const result = await applyPaymentApproval('order2', '222', { status: 'approved', transaction_amount: 16.89 });

    expect(result.applied).toBe(true);
    expect(store['order2'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(store['order2'].hasVideoAccess).toBe(true);
    expect(store['order2'].videoAddonPaid).toBe(true);
  });

  it('C-09: video_addon isolado NUNCA escreve paymentStatus, só hasVideoAccess', async () => {
    store['order3'] = { paymentIntentSku: 'video_addon', paymentStatus: 'AGUARDANDO_PAGAMENTO', videoPaymentId: null };

    const result = await applyPaymentApproval('order3', '333', { status: 'approved', transaction_amount: 6.90 });

    expect(result.applied).toBe(true);
    expect(store['order3'].paymentStatus).toBe('AGUARDANDO_PAGAMENTO'); // inalterado
    expect(store['order3'].hasVideoAccess).toBe(true);
    expect(store['order3'].videoAddonPaid).toBe(true);
    expect(store['order3'].videoPaymentId).toBe('333');
  });

  it('A-13: usa o SKU persistido mesmo se o valor da transação coincidir com outro SKU por acaso', async () => {
    // Valor de 6.90 seria classificado como video_addon pela heurística antiga — mas o SKU
    // persistido diz que é audio_only (ex: promoção futura de 6.90 para música).
    store['order4'] = { paymentIntentSku: 'audio_only', paymentId: null };

    const result = await applyPaymentApproval('order4', '444', { status: 'approved', transaction_amount: 6.90 });

    expect(result.applied).toBe(true);
    expect(store['order4'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(store['order4'].hasVideoAccess).toBeUndefined();
  });

  it('A-09: o mesmo paymentId não é processado duas vezes (idempotência)', async () => {
    store['order5'] = { paymentIntentSku: 'audio_only', paymentId: null };

    const first = await applyPaymentApproval('order5', '555', { status: 'approved', transaction_amount: 9.99 });
    expect(first.applied).toBe(true);

    const second = await applyPaymentApproval('order5', '555', { status: 'approved', transaction_amount: 9.99 });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('already_processed');
  });

  it('pedido não encontrado: não aplica nada', async () => {
    const result = await applyPaymentApproval('nao-existe', '999', { status: 'approved', transaction_amount: 9.99 });
    expect(result.applied).toBe(false);
  });

  it('status não aprovado (pending): não aplica nada', async () => {
    store['order6'] = { paymentIntentSku: 'audio_only' };
    const result = await applyPaymentApproval('order6', '666', { status: 'pending', transaction_amount: 9.99 });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('not_approved');
  });

  it('estorno (refunded) revoga paymentStatus de volta para AGUARDANDO_PAGAMENTO', async () => {
    store['order7'] = { paymentStatus: 'PAGAMENTO_APROVADO', paymentId: '777' };
    const result = await applyPaymentApproval('order7', '777', { status: 'refunded' });
    expect(result.applied).toBe(true);
    expect(result.revoked).toBe(true);
    expect(store['order7'].paymentStatus).toBe('AGUARDANDO_PAGAMENTO');
  });

  it('cancelamento do vídeo revoga hasVideoAccess/videoAddonPaid', async () => {
    store['order8'] = { hasVideoAccess: true, videoAddonPaid: true, videoPaymentId: '888' };
    const result = await applyPaymentApproval('order8', '888', { status: 'cancelled' });
    expect(result.applied).toBe(true);
    expect(store['order8'].hasVideoAccess).toBe(false);
    expect(store['order8'].videoAddonPaid).toBe(false);
  });

  // Lote 8 no FIX_PLAN.md: webhook "fora de ordem" — uma notificação antiga de status pendente
  // chegando DEPOIS que o pagamento já foi aprovado não pode reverter a aprovação.
  it('webhook fora de ordem: uma notificação "pending" atrasada não desfaz aprovação já aplicada', async () => {
    store['order11'] = { paymentIntentSku: 'audio_only', paymentStatus: 'PAGAMENTO_APROVADO', paymentId: '1111' };

    const result = await applyPaymentApproval('order11', '1111', { status: 'pending', transaction_amount: 9.99 });

    expect(result.applied).toBe(false);
    expect(store['order11'].paymentStatus).toBe('PAGAMENTO_APROVADO'); // inalterado
  });

  it('notifica o cliente via WhatsApp quando a música é aprovada e há telefone cadastrado', async () => {
    store['order12'] = {
      paymentIntentSku: 'audio_only',
      customerPhone: '5511999999999',
      whatsappRequested: true,
      customerName: 'Maria',
      honoreeName: 'Vovó Lúcia',
      audioFiles: ['https://cdn1.suno.ai/a.mp3', 'https://cdn1.suno.ai/b.mp3'],
      paymentId: null,
    };

    await applyPaymentApproval('order12', '1212', { status: 'approved', transaction_amount: 9.99 });

    expect(sendPaymentApprovedTemplateMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentApprovedTemplateMock).toHaveBeenCalledWith('5511999999999', expect.objectContaining({
      customerName: 'Maria',
      honoreeName: 'Vovó Lúcia',
      audioUrls: ['https://cdn1.suno.ai/a.mp3', 'https://cdn1.suno.ai/b.mp3'],
    }));
    expect(store['order12'].paymentWhatsappSent).toBe(true);
  });

  it('NÃO notifica via WhatsApp no pagamento isolado do add-on de vídeo', async () => {
    store['order13'] = { paymentIntentSku: 'video_addon', customerPhone: '5511999999999', videoPaymentId: null };

    await applyPaymentApproval('order13', '1313', { status: 'approved', transaction_amount: 6.90 });

    expect(sendPaymentApprovedTemplateMock).not.toHaveBeenCalled();
  });

  it('não notifica de novo se paymentWhatsappSent já é true (idempotência)', async () => {
    store['order14'] = {
      paymentIntentSku: 'audio_only',
      customerPhone: '5511999999999',
      paymentWhatsappSent: true,
      paymentId: null,
    };

    await applyPaymentApproval('order14', '1414', { status: 'approved', transaction_amount: 9.99 });

    expect(sendPaymentApprovedTemplateMock).not.toHaveBeenCalled();
  });
});
