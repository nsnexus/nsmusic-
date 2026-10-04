import { describe, it, expect, vi, beforeEach } from 'vitest';

let store = {};
let autoRetryCalls = [];

vi.mock('@/lib/db', () => ({
  getTask: vi.fn(async (id) => store.tasks?.[id] || null),
  updateTaskResult: vi.fn(async () => ({ success: true })),
  extractAudioTracks: vi.fn((result) => {
    if (result?.data?.tracks) return result.data.tracks;
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
  global.fetch = vi.fn();
  delete process.env.UNIFICALLY_API_KEY;
  delete process.env.KIE_API_KEY;
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
});
