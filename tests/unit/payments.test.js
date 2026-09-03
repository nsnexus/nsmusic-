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

const requestPlaybackGenerationMock = vi.fn().mockResolvedValue({ ok: true, taskId: 'kie-task-1' });
vi.mock('@/lib/playback', () => ({
  requestPlaybackGeneration: (...args) => requestPlaybackGenerationMock(...args),
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
  requestPlaybackGenerationMock.mockClear();
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

  it('impacto abaixo do preço do combo: aprova música mas NÃO concede vídeo', async () => {
    store['order2b'] = { paymentIntentSku: 'impacto', paymentId: null };

    const result = await applyPaymentApproval('order2b', '222b', { status: 'approved', transaction_amount: 9.99 });

    expect(result.applied).toBe(true);
    expect(store['order2b'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(store['order2b'].hasVideoAccess).toBeUndefined();
    expect(store['order2b'].videoAddonPaid).toBeUndefined();
  });

  it('impacto no preço do combo ou acima: aprova música E concede vídeo (pela faixa do valor real pago)', async () => {
    store['order2c'] = { paymentIntentSku: 'impacto', paymentId: null };

    const result = await applyPaymentApproval('order2c', '222c', { status: 'approved', transaction_amount: 25 });

    expect(result.applied).toBe(true);
    expect(store['order2c'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(store['order2c'].hasVideoAccess).toBe(true);
    expect(store['order2c'].videoAddonPaid).toBe(true);
  });

  it('impacto exatamente no preço do combo (16.89): concede vídeo mesmo com arredondamento de ponto flutuante', async () => {
    store['order2d'] = { paymentIntentSku: 'impacto', paymentId: null };

    const result = await applyPaymentApproval('order2d', '222d', { status: 'approved', transaction_amount: 16.89 });

    expect(result.applied).toBe(true);
    expect(store['order2d'].hasVideoAccess).toBe(true);
  });

  it('C-09: carta_addon isolado NUNCA escreve paymentStatus, só hasCartaAccess', async () => {
    store['orderCarta'] = { paymentIntentSku: 'carta_addon', paymentStatus: 'AGUARDANDO_PAGAMENTO', cartaPaymentId: null, story: 'história real' };

    const result = await applyPaymentApproval('orderCarta', 'c1', { status: 'approved', transaction_amount: 5.99 });

    expect(result.applied).toBe(true);
    expect(store['orderCarta'].paymentStatus).toBe('AGUARDANDO_PAGAMENTO'); // inalterado
    expect(store['orderCarta'].hasCartaAccess).toBe(true);
    expect(store['orderCarta'].cartaAddonPaid).toBe(true);
    expect(store['orderCarta'].cartaPaymentId).toBe('c1');
  });

  it('carta_addon não concede vídeo nem playback por tabela', async () => {
    store['orderCarta2'] = { paymentIntentSku: 'carta_addon', story: 'história real' };

    await applyPaymentApproval('orderCarta2', 'c2', { status: 'approved', transaction_amount: 5.99 });

    expect(store['orderCarta2'].hasVideoAccess).toBeUndefined();
    expect(store['orderCarta2'].hasPlaybackAccess).toBeUndefined();
  });

  it('estorno da carta revoga o acesso concedido', async () => {
    store['orderCarta3'] = { cartaPaymentId: 'c3', hasCartaAccess: true, cartaAddonPaid: true, paymentStatus: 'PAGAMENTO_APROVADO' };

    const result = await applyPaymentApproval('orderCarta3', 'c3', { status: 'refunded' });

    expect(result.revoked).toBe(true);
    expect(store['orderCarta3'].hasCartaAccess).toBe(false);
    expect(store['orderCarta3'].cartaAddonPaid).toBe(false);
    // A música continua paga — o estorno foi só do add-on.
    expect(store['orderCarta3'].paymentStatus).toBe('PAGAMENTO_APROVADO');
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

  it('playback_addon isolado NUNCA escreve paymentStatus, só hasPlaybackAccess', async () => {
    store['order15'] = {
      paymentIntentSku: 'playback_addon',
      paymentStatus: 'PAGAMENTO_APROVADO',
      sunoTaskId: 'task-abc',
      audioIds: ['audio-1', 'audio-2'],
      playbackPaymentId: null,
    };

    const result = await applyPaymentApproval('order15', '1515', { status: 'approved', transaction_amount: 4.99 });

    expect(result.applied).toBe(true);
    expect(store['order15'].paymentStatus).toBe('PAGAMENTO_APROVADO'); // inalterado
    expect(store['order15'].hasPlaybackAccess).toBe(true);
    expect(store['order15'].playbackAddonPaid).toBe(true);
    expect(store['order15'].playbackPaymentId).toBe('1515');
  });

  it('playback_addon aprovado dispara a geração na Kie.ai com o taskId/audioId do pedido', async () => {
    store['order16'] = {
      paymentIntentSku: 'playback_addon',
      sunoTaskId: 'task-xyz',
      audioIds: ['audio-primary', 'audio-secondary'],
      playbackPaymentId: null,
    };

    await applyPaymentApproval('order16', '1616', { status: 'approved', transaction_amount: 4.99 });

    expect(requestPlaybackGenerationMock).toHaveBeenCalledTimes(1);
    expect(requestPlaybackGenerationMock).toHaveBeenCalledWith(
      { orderId: 'order16', sunoTaskId: 'task-xyz', audioId: 'audio-primary' },
      expect.anything()
    );
    expect(store['order16'].playbackRequested).toBe(true);
    expect(store['order16'].playbackRequesting).toBe(false);
  });

  it('playback_addon em pedido antigo (sem sunoTaskId/audioIds) marca FAILED e não chama a Kie.ai', async () => {
    store['order17'] = {
      paymentIntentSku: 'playback_addon',
      playbackPaymentId: null,
      // sem sunoTaskId nem audioIds — pedido gerado antes deste recurso existir
    };

    const result = await applyPaymentApproval('order17', '1717', { status: 'approved', transaction_amount: 4.99 });

    expect(result.applied).toBe(true);
    expect(store['order17'].hasPlaybackAccess).toBe(true); // pagamento continua válido
    expect(requestPlaybackGenerationMock).not.toHaveBeenCalled();
    expect(store['order17'].playbackStatus).toBe('FAILED');
    expect(store['order17'].playbackError).toBe('missing_track_reference');
  });

  it('NÃO notifica via WhatsApp no pagamento isolado do add-on de playback', async () => {
    store['order18'] = {
      paymentIntentSku: 'playback_addon',
      customerPhone: '5511999999999',
      sunoTaskId: 'task-1',
      audioIds: ['audio-1'],
      playbackPaymentId: null,
    };

    await applyPaymentApproval('order18', '1818', { status: 'approved', transaction_amount: 4.99 });

    expect(sendPaymentApprovedTemplateMock).not.toHaveBeenCalled();
  });

  it('cancelamento do playback revoga hasPlaybackAccess/playbackAddonPaid', async () => {
    store['order19'] = { hasPlaybackAccess: true, playbackAddonPaid: true, playbackPaymentId: '1919' };
    const result = await applyPaymentApproval('order19', '1919', { status: 'cancelled' });
    expect(result.applied).toBe(true);
    expect(store['order19'].hasPlaybackAccess).toBe(false);
    expect(store['order19'].playbackAddonPaid).toBe(false);
  });
});

// ACHADO 30/08/2026 — add-on liberado sem pagamento.
//
// paymentIntentSku guarda apenas a ÚLTIMA cobrança criada no pedido. Quando a aprovação chegava de
// uma cobrança ANTERIOR (retentativa de webhook da Efí, cron de reconciliação, ou cliente pagando um
// QR Code antigo), o crédito ia para o produto errado: quem pagou a música e depois só ABRIU a
// oferta de playback — o que já cria a cobrança e sobrescreve paymentIntentSku — ganhava o playback
// de graça assim que qualquer notificação atrasada da música chegasse.
//
// A correção é o mapa paymentIntentSkuByTxid (txid -> SKU), gravado por /api/payments/create.
describe('applyPaymentApproval — SKU vem do txid pago, não da última cobrança criada', () => {
  it('pagamento ATRASADO da música NÃO libera o playback recém-oferecido', async () => {
    store['order20'] = {
      // Estado real: música paga, cliente abriu a oferta de playback (cobrança criada, não paga).
      paymentIntentId: 'txid-playback',
      paymentIntentSku: 'playback_addon',
      paymentIntentSkuByTxid: {
        'txid-musica': 'audio_only',
        'txid-playback': 'playback_addon',
      },
      previousPaymentIntentIds: ['txid-musica'],
      sunoTaskId: 'task-1',
      audioIds: ['audio-1'],
      paymentId: null,
      playbackPaymentId: null,
    };

    // Chega a confirmação da MÚSICA (txid antigo), não do playback.
    const result = await applyPaymentApproval('order20', 'txid-musica', { status: 'approved', transaction_amount: 9.99 });

    expect(result.applied).toBe(true);
    expect(result.sku).toBe('audio_only');
    // O que importa: o playback continua bloqueado.
    expect(store['order20'].hasPlaybackAccess).toBeUndefined();
    expect(store['order20'].playbackAddonPaid).toBeUndefined();
    // E a música foi corretamente aprovada.
    expect(store['order20'].paymentStatus).toBe('PAGAMENTO_APROVADO');
    expect(requestPlaybackGenerationMock).not.toHaveBeenCalled();
  });

  it('pagamento ATRASADO da música NÃO libera o add-on de vídeo recém-oferecido', async () => {
    store['order21'] = {
      paymentIntentId: 'txid-video',
      paymentIntentSku: 'video_addon',
      paymentIntentSkuByTxid: {
        'txid-musica': 'audio_only',
        'txid-video': 'video_addon',
      },
      previousPaymentIntentIds: ['txid-musica'],
      paymentId: null,
      videoPaymentId: null,
    };

    const result = await applyPaymentApproval('order21', 'txid-musica', { status: 'approved', transaction_amount: 9.99 });

    expect(result.applied).toBe(true);
    expect(result.sku).toBe('audio_only');
    expect(store['order21'].hasVideoAccess).toBeUndefined();
    expect(store['order21'].videoAddonPaid).toBeUndefined();
  });

  it('o pagamento do PRÓPRIO playback continua liberando normalmente', async () => {
    store['order22'] = {
      paymentIntentId: 'txid-playback',
      paymentIntentSku: 'playback_addon',
      paymentIntentSkuByTxid: {
        'txid-musica': 'audio_only',
        'txid-playback': 'playback_addon',
      },
      paymentStatus: 'PAGAMENTO_APROVADO',
      sunoTaskId: 'task-1',
      audioIds: ['audio-1'],
      playbackPaymentId: null,
    };

    const result = await applyPaymentApproval('order22', 'txid-playback', { status: 'approved', transaction_amount: 4.99 });

    expect(result.applied).toBe(true);
    expect(result.sku).toBe('playback_addon');
    expect(store['order22'].hasPlaybackAccess).toBe(true);
    expect(requestPlaybackGenerationMock).toHaveBeenCalledTimes(1);
  });

  it('pedido antigo sem o mapa: usa paymentIntentSku só quando o txid é o da cobrança atual', async () => {
    store['order23'] = {
      paymentIntentId: 'txid-atual',
      paymentIntentSku: 'video_addon',
      paymentId: null,
      videoPaymentId: null,
    };

    const result = await applyPaymentApproval('order23', 'txid-atual', { status: 'approved', transaction_amount: 6.90 });

    expect(result.applied).toBe(true);
    expect(result.sku).toBe('video_addon');
    expect(store['order23'].hasVideoAccess).toBe(true);
  });

  it('pedido antigo sem o mapa e txid DIFERENTE do atual: cai na heurística de valor, não no SKU da última cobrança', async () => {
    store['order24'] = {
      paymentIntentId: 'txid-playback-novo',
      paymentIntentSku: 'playback_addon',
      previousPaymentIntentIds: ['txid-musica-antigo'],
      sunoTaskId: 'task-1',
      audioIds: ['audio-1'],
      paymentId: null,
      playbackPaymentId: null,
    };

    // Valor de 9,99 => música, apesar de paymentIntentSku dizer playback_addon.
    const result = await applyPaymentApproval('order24', 'txid-musica-antigo', { status: 'approved', transaction_amount: 9.99 });

    expect(result.applied).toBe(true);
    expect(result.sku).toBe('audio_only');
    expect(store['order24'].hasPlaybackAccess).toBeUndefined();
    expect(store['order24'].paymentStatus).toBe('PAGAMENTO_APROVADO');
  });
});
