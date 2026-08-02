import { describe, it, expect, vi, beforeEach } from 'vitest';

// Rota de campanha manual (admin) — envia mensagens em lote de "recuperação" (gerou música, não
// pagou) ou "upsell de vídeo" (pagou música, não pagou vídeo). Cada pedido é reconfirmado no
// servidor antes de enviar (nunca confia só na lista revisada no painel) e nunca reenvia pro mesmo
// pedido duas vezes.

let store;
let updateDocCalls;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _collection, id) => ({ id }),
  getDoc: async (ref) => ({
    exists: () => Object.prototype.hasOwnProperty.call(store, ref.id),
    data: () => store[ref.id],
  }),
  updateDoc: async (ref, updates) => {
    updateDocCalls.push({ id: ref.id, updates });
    Object.assign(store[ref.id], updates);
  },
}));

const requireAdminMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAdmin: (...args) => requireAdminMock(...args),
}));

const sendWhatsAppMessageDetailedMock = vi.fn();
vi.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessageDetailed: (...args) => sendWhatsAppMessageDetailedMock(...args),
}));

const { POST } = await import('@/app/api/whatsapp/campaign/route');

function makeRequest(body) {
  return { json: async () => body };
}

beforeEach(() => {
  store = {};
  updateDocCalls = [];
  requireAdminMock.mockReset();
  requireAdminMock.mockResolvedValue({ ok: true });
  sendWhatsAppMessageDetailedMock.mockReset();
  sendWhatsAppMessageDetailedMock.mockResolvedValue({ success: true });
});

describe('POST /api/whatsapp/campaign', () => {
  it('bloqueia sem admin', async () => {
    requireAdminMock.mockResolvedValue({ ok: false, error: 'Token ausente', status: 401 });
    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    expect(res.status).toBe(401);
    expect(sendWhatsAppMessageDetailedMock).not.toHaveBeenCalled();
  });

  it('rejeita tipo de campanha inválido', async () => {
    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'invalido' }));
    expect(res.status).toBe(400);
  });

  it('rejeita orderIds vazio', async () => {
    const res = await POST(makeRequest({ orderIds: [], type: 'recovery' }));
    expect(res.status).toBe(400);
  });

  it('envia recuperação só pra pedido que gerou música e não pagou', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '5531999999999', customerName: 'Ana', honoreeName: 'Bia' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    const data = await res.json();

    expect(data.sent).toBe(1);
    expect(sendWhatsAppMessageDetailedMock).toHaveBeenCalledTimes(1);
    expect(updateDocCalls[0].updates.recoveryMessageSentAt).toBeDefined();
  });

  it('não reenvia recuperação pro mesmo pedido duas vezes', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '5531999999999', recoveryMessageSentAt: '2026-08-01T00:00:00.000Z' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    const data = await res.json();

    expect(data.sent).toBe(0);
    expect(data.skipped).toBe(1);
    expect(sendWhatsAppMessageDetailedMock).not.toHaveBeenCalled();
  });

  it('não envia recuperação pra pedido já pago (reconfirma critério no servidor)', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'PAGAMENTO_APROVADO', customerPhone: '5531999999999' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    const data = await res.json();

    expect(data.sent).toBe(0);
    expect(data.skipped).toBe(1);
    expect(sendWhatsAppMessageDetailedMock).not.toHaveBeenCalled();
  });

  it('envia upsell de vídeo só pra quem pagou música e não tem vídeo', async () => {
    store['o1'] = { paymentStatus: 'PAGAMENTO_APROVADO', hasVideoAccess: false, videoAddonPaid: false, customerPhone: '5531999999999', customerName: 'Ana', honoreeName: 'Bia' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'video_upsell' }));
    const data = await res.json();

    expect(data.sent).toBe(1);
    expect(updateDocCalls[0].updates.videoUpsellMessageSentAt).toBeDefined();
  });

  it('não envia upsell de vídeo pra quem já tem acesso ao vídeo', async () => {
    store['o1'] = { paymentStatus: 'PAGAMENTO_APROVADO', hasVideoAccess: true, customerPhone: '5531999999999' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'video_upsell' }));
    const data = await res.json();

    expect(data.sent).toBe(0);
    expect(sendWhatsAppMessageDetailedMock).not.toHaveBeenCalled();
  });

  it('pula pedido sem telefone', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    const data = await res.json();

    expect(data.sent).toBe(0);
    expect(data.skipped).toBe(1);
  });

  it('pula pedido excluído logicamente (deletedAt)', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '5531999999999', deletedAt: '2026-08-01T00:00:00.000Z' };

    const res = await POST(makeRequest({ orderIds: ['o1'], type: 'recovery' }));
    const data = await res.json();

    expect(data.sent).toBe(0);
    expect(data.skipped).toBe(1);
  });

  it('conta falha de envio sem travar o restante do lote', async () => {
    store['o1'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '5531999999999' };
    store['o2'] = { productionStatus: 'AUDIO_GERADO', paymentStatus: 'AGUARDANDO_PAGAMENTO', customerPhone: '5531988888888' };
    sendWhatsAppMessageDetailedMock
      .mockResolvedValueOnce({ success: false, error: 'falha' })
      .mockResolvedValueOnce({ success: true });

    const res = await POST(makeRequest({ orderIds: ['o1', 'o2'], type: 'recovery' }));
    const data = await res.json();

    expect(data.failed).toBe(1);
    expect(data.sent).toBe(1);
  });

  it('rejeita lote maior que o máximo permitido', async () => {
    const orderIds = Array.from({ length: 101 }, (_, i) => `o${i}`);
    const res = await POST(makeRequest({ orderIds, type: 'recovery' }));
    expect(res.status).toBe(400);
  });
});
