import { describe, it, expect, vi, beforeEach } from 'vitest';

let store = {};
let autoRetryCalls = [];

let updateTaskResultCalls = [];

vi.mock('@/lib/db', () => ({
  getTask: vi.fn(async (id) => store.tasks?.[id] || null),
  updateTaskResult: vi.fn(async (...args) => {
    updateTaskResultCalls.push(args);
    return { success: true };
  }),
  extractAudioTracks: vi.fn((result) => {
    if (result?.data?.tracks) return result.data.tracks;
    if (Array.isArray(result?.data)) return result.data;
    if (result?.tracks) return result.tracks;
    return [];
  }),
}));

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => store.orders?.[id] || null),
  updateOrder: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null }),
        }),
      }),
    }),
  })),
}));

vi.mock('@/lib/suno', async () => {
  const actual = await vi.importActual('@/lib/suno');
  return {
    ...actual,
    resolveLatestTaskId: vi.fn(async (taskId) => {
      if (store.tasks?.[taskId]?.retryTaskId) {
        return store.tasks[taskId].retryTaskId;
      }
      return taskId;
    }),
    maybeAutoRetrySunoFailure: vi.fn(async (params) => {
      autoRetryCalls.push(params);
      return { retried: true, newTaskId: 'kie-task-fallback-999' };
    }),
    recordSunoFailure: vi.fn(async () => {}),
  };
});

const { GET } = await import('@/app/api/suno/status/route');

beforeEach(() => {
  store = { tasks: {}, orders: {} };
  autoRetryCalls = [];
  updateTaskResultCalls = [];
  global.fetch = vi.fn();
  delete process.env.UNIFICALLY_API_KEY;
  delete process.env.KIE_API_KEY;
  delete process.env.SUNO_PRIMARY_PROVIDER;
});

describe('GET /api/suno/status — Timeout de 3 minutos e Failover para Kie.ai', () => {
  it('quando tarefa Unifically tem menos de 3 minutos e está processando, mantém PROCESSING', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    store.tasks['task-unif-recent'] = {
      id: 'task-unif-recent',
      provider: 'unifically',
      orderId: 'order-1',
      createdAt: twoMinutesAgo,
    };
    store.orders['order-1'] = {
      id: 'order-1',
      productionStatus: 'GERANDO_AUDIO',
      sunoRequestedAt: twoMinutesAgo,
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'processing' }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-unif-recent');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('PROCESSING');
    expect(data.providerStatus).toBe('processing');
    expect(autoRetryCalls).toHaveLength(0);
  });

  it('quando tarefa Unifically passa de 3 minutos gerando áudio, aciona fallback para Kie.ai', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';

    const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000).toISOString();
    store.tasks['task-unif-stuck'] = {
      id: 'task-unif-stuck',
      provider: 'unifically',
      orderId: 'order-2',
      createdAt: fourMinutesAgo,
    };
    store.orders['order-2'] = {
      id: 'order-2',
      productionStatus: 'GERANDO_AUDIO',
      sunoRequestedAt: fourMinutesAgo,
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ status: 'processing' }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-unif-stuck');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('PROCESSING');
    expect(data.providerStatus).toBe('FALLBACK_KIE');
    expect(data.fallback).toBe(true);
    expect(data.newTaskId).toBe('kie-task-fallback-999');

    expect(autoRetryCalls).toHaveLength(1);
    expect(autoRetryCalls[0].taskId).toBe('task-unif-stuck');
    expect(autoRetryCalls[0].orderId).toBe('order-2');
    expect(autoRetryCalls[0].reason).toBe('unifically_timeout_3min');
    expect(autoRetryCalls[0].preferredProvider).toBe('kie');
  });

  it('quando Unifically retorna erro de crédito (HTTP 402), aciona fallback imediato para Kie.ai', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';

    const thirtySecondsAgo = new Date(Date.now() - 30 * 1000).toISOString();
    store.tasks['task-unif-nocredit'] = {
      id: 'task-unif-nocredit',
      provider: 'unifically',
      orderId: 'order-3',
      createdAt: thirtySecondsAgo,
    };

    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ error: 'Insufficient credits' }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-unif-nocredit');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('PROCESSING');
    expect(data.providerStatus).toBe('FALLBACK_KIE');
    expect(data.fallback).toBe(true);
    expect(data.newTaskId).toBe('kie-task-fallback-999');

    expect(autoRetryCalls).toHaveLength(1);
    expect(autoRetryCalls[0].reason).toBe('unifically_http_402');
    expect(autoRetryCalls[0].preferredProvider).toBe('kie');
  });

  it('quando provedor é Kie.ai e retorna status SUCCESS com faixas, marca COMPLETED e atualiza pedido', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';

    store.tasks['task-kie-done'] = {
      id: 'task-kie-done',
      provider: 'kie',
      orderId: 'order-kie-1',
    };
    store.orders['order-kie-1'] = {
      id: 'order-kie-1',
      productionStatus: 'GERANDO_AUDIO',
    };

    const mockTracks = [
      { id: 'track-1', audio_url: 'https://cdn1.suno.ai/track-1.mp3' },
      { id: 'track-2', audio_url: 'https://cdn1.suno.ai/track-2.mp3' },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          status: 'SUCCESS',
          tracks: mockTracks,
        },
      }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-kie-done');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('COMPLETED');
    expect(data.tracks).toHaveLength(2);
    expect(updateTaskResultCalls).toHaveLength(1);
    expect(updateTaskResultCalls[0][0]).toBe('task-kie-done');
    expect(updateTaskResultCalls[0][2]).toBe('order-kie-1'); // orderId passado explicitamente
  });

  it('quando Kie.ai retorna músicas prontas em array data sem campo status no root, marca COMPLETED', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';
    process.env.SUNO_PRIMARY_PROVIDER = 'kie';

    store.tasks['task-kie-array'] = {
      id: 'task-kie-array',
      provider: 'kie',
      orderId: 'order-kie-2',
    };

    const mockTracks = [
      { id: 'track-arr-1', audio_url: 'https://audiostream.kie.ai/stream/track-arr-1.mp3' },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: mockTracks,
      }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-kie-array');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('COMPLETED');
    expect(data.tracks).toHaveLength(1);
    expect(updateTaskResultCalls).toHaveLength(1);
  });

  it('quando SUNO_PRIMARY_PROVIDER é kie e task não tem provider gravado, consulta Kie.ai diretamente', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';
    process.env.SUNO_PRIMARY_PROVIDER = 'kie';

    store.tasks['task-no-prov'] = {
      id: 'task-no-prov',
      orderId: 'order-4',
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          status: 'SUCCESS',
          tracks: [{ id: 'track-k', audio_url: 'https://cdn1.suno.ai/track-k.mp3' }],
        },
      }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-no-prov');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('COMPLETED');
    // Verifica que a URL chamada pelo fetch foi a da Kie.ai, não Unifically
    expect(global.fetch.mock.calls[0][0]).toContain('api.kie.ai');
  });

  it('quando Unifically retorna 404 (tarefa gerada na Kie), faz failover imediato para Kie.ai e encontra a música', async () => {
    process.env.UNIFICALLY_API_KEY = 'unif-secret';
    process.env.KIE_API_KEY = 'kie-secret';
    // Sem SUNO_PRIMARY_PROVIDER (default unifically)

    store.tasks['task-kie-in-unif-default'] = {
      id: 'task-kie-in-unif-default',
      orderId: 'order-5',
    };

    // 1ª chamada (Unifically) retorna 404
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Task not found' }),
    });

    // 2ª chamada (Kie.ai failover) retorna sucesso com músicas
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
          status: 'SUCCESS',
          tracks: [{ id: 'track-from-kie', audio_url: 'https://cdn1.suno.ai/track-from-kie.mp3' }],
        },
      }),
    });

    const req = new Request('http://localhost:3000/api/suno/status?taskId=task-kie-in-unif-default');
    const res = await GET(req);
    const data = await res.json();

    expect(data.status).toBe('COMPLETED');
    expect(data.tracks).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0]).toContain('api.unifically.com');
    expect(global.fetch.mock.calls[1][0]).toContain('api.kie.ai');
  });
});
