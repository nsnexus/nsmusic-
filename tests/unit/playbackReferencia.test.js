import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// A separação vocal continua 100% na Kie.ai, inclusive para música gerada na VPS própria (decisão
// do dono do estúdio em 24/09/2026). A armadilha: música da VPS não existe na conta Kie.ai, então
// mandar o `sunoTaskId` dela apontaria para uma tarefa que a Kie.ai nunca viu — o cliente pagaria
// R$ 4,99 e o playback nunca sairia. Estes testes fixam qual referência vai em cada caso.

let store;

vi.mock('@/lib/firebase-edge', () => ({ dbEdge: {} }));

vi.mock('firebase/firestore/lite', () => ({
  doc: (_db, _collection, id) => ({ id }),
  updateDoc: async (ref, data) => {
    store[ref.id] = { ...(store[ref.id] || {}), ...data };
  },
}));

const { requestPlaybackGeneration } = await import('@/lib/playback');

const ENV = { KIE_API_KEY: 'chave-kie', NEXT_PUBLIC_SITE_URL: 'https://nsmusic.ia.br', KIE_WEBHOOK_SECRET: 'segredo' };

const corpoEnviado = () => JSON.parse(global.fetch.mock.calls[0][1].body);

describe('referência da faixa na separação vocal', () => {
  beforeEach(() => {
    store = {};
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: { taskId: 'tarefa-separacao' } }),
    });
  });

  afterEach(() => { vi.restoreAllMocks(); });

  it('música da Kie.ai vai por taskId', async () => {
    const r = await requestPlaybackGeneration({
      orderId: 'ped1', sunoTaskId: 'tarefa-kie', audioId: 'faixa-1', provider: 'kie',
      audioUrl: 'https://cdn1.suno.ai/faixa-1.mp3',
    }, ENV);

    expect(r.ok).toBe(true);
    const corpo = corpoEnviado();
    expect(corpo.taskId).toBe('tarefa-kie');
    expect(corpo.audioUrl).toBeUndefined();
  });

  it('pedido antigo, sem provider gravado, continua indo por taskId', async () => {
    await requestPlaybackGeneration({ orderId: 'ped2', sunoTaskId: 'tarefa-kie', audioId: 'faixa-1' }, ENV);
    expect(corpoEnviado().taskId).toBe('tarefa-kie');
  });

  it('música da VPS vai por audioUrl, nunca pelo taskId que a Kie.ai não conhece', async () => {
    await requestPlaybackGeneration({
      orderId: 'ped3', sunoTaskId: 'clipe-da-vps', audioId: 'clipe-da-vps', provider: 'suno_vps',
      audioUrl: 'https://cdn1.suno.ai/clipe-da-vps.mp3',
    }, ENV);

    const corpo = corpoEnviado();
    expect(corpo.audioUrl).toBe('https://cdn1.suno.ai/clipe-da-vps.mp3');
    expect(corpo.taskId).toBeUndefined();
    expect(corpo.type).toBe('separate_vocal');
  });

  it('VPS sem audioUrl nem tenta chamar a Kie.ai', async () => {
    const r = await requestPlaybackGeneration({
      orderId: 'ped4', sunoTaskId: 'clipe', audioId: 'clipe', provider: 'suno_vps', audioUrl: '',
    }, ENV);

    expect(r).toEqual({ ok: false, error: 'missing_arguments' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('o callback leva o orderId e o segredo na query string', async () => {
    await requestPlaybackGeneration({ orderId: 'ped5', sunoTaskId: 't', audioId: 'a', provider: 'kie' }, ENV);
    const url = corpoEnviado().callBackUrl;
    expect(url).toContain('/api/playback/webhook');
    expect(url).toContain('secret=segredo');
    expect(url).toContain('orderId=ped5');
  });
});
