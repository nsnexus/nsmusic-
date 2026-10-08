import { describe, it, expect, vi, beforeEach } from 'vitest';

let store = {};

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      update: (data) => ({
        eq: (_col, val) => {
          store[val] = { ...(store[val] || {}), ...data };
          return Promise.resolve({ data: null, error: null });
        }
      }),
      select: () => ({
        or: () => ({
          maybeSingle: () => Promise.resolve({ data: null })
        })
      })
    })
  }))
}));

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => (store[id] ? { id, ...store[id] } : null)),
  updateOrder: vi.fn(async (id, data) => {
    store[id] = { ...(store[id] || {}), ...data };
    return { success: true };
  }),
}));

vi.mock('@/lib/db', () => ({
  saveTask: vi.fn(async (taskId, status, result, orderId, meta) => {
    store[taskId] = { status, result, orderId, ...(meta || {}) };
    return true;
  }),
  getTask: vi.fn(async (taskId) => store[taskId] || null),
  updateTaskResult: vi.fn(async () => true),
  extractAudioTracks: vi.fn((data) => data?.tracks || []),
}));

vi.mock('@/lib/configSite', () => ({
  lerConfigSite: vi.fn(async (env) => {
    return env?.MOCK_CONFIG || {};
  })
}));

const {
  PROVIDER_KIE,
  PROVIDER_SUNO_LOCAL,
  resolvePrimaryProvider,
  requestSunoGeneration
} = await import('@/lib/suno');

const { GET } = await import('@/app/api/suno/status/route');

describe('Suno Local Worker e Failover', () => {
  beforeEach(() => {
    store = {};
    vi.clearAllMocks();
  });

  it('resolvePrimaryProvider reconhece suno_local quando configurado no site', async () => {
    const env = { MOCK_CONFIG: { sunoPrimaryProvider: 'suno_local' } };
    const provider = await resolvePrimaryProvider(env);
    expect(provider).toBe(PROVIDER_SUNO_LOCAL);
  });

  it('requestSunoGeneration com suno_local cria tarefa local pendente sem chamar APIs externas', async () => {
    const result = await requestSunoGeneration({
      orderId: 'pedido-123',
      prompt: 'Letra de teste',
      tags: 'Acoustic',
      preferredProvider: PROVIDER_SUNO_LOCAL
    }, {});

    expect(result.ok).toBe(true);
    expect(result.provider).toBe(PROVIDER_SUNO_LOCAL);
    expect(result.taskId).toContain('suno_local_pedido-123');
    expect(store['pedido-123']?.sunoProvider).toBe(PROVIDER_SUNO_LOCAL);
    expect(store['pedido-123']?.productionStatus).toBe('GERANDO_AUDIO');
  });

  it('requestSunoGeneration desvia para Kie.ai quando o pedido tem voz personalizada do cliente mesmo se suno_local for o provedor', async () => {
    store['pedido-custom-voice'] = {
      id: 'pedido-custom-voice',
      isCustomVoice: true,
      customVoiceId: 'voice_abc123'
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, data: { taskId: 'kie_task_voice_123' } })
    });

    try {
      const env = { KIE_API_KEY: 'test-kie-key' };
      const result = await requestSunoGeneration({
        orderId: 'pedido-custom-voice',
        prompt: 'Letra de teste',
        tags: 'Acoustic',
        preferredProvider: PROVIDER_SUNO_LOCAL
      }, env);

      expect(result.ok).toBe(true);
      expect(result.provider).toBe(PROVIDER_KIE);
      expect(result.taskId).toBe('kie_task_voice_123');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('GET /api/suno/status devolve COMPLETED quando o robô já salvou musicUrl', async () => {
    const taskId = 'suno_local_ped-1';
    store[taskId] = {
      orderId: 'ped-1',
      provider: PROVIDER_SUNO_LOCAL,
      status: 'PROCESSING'
    };
    store['ped-1'] = {
      id: 'ped-1',
      sunoProvider: PROVIDER_SUNO_LOCAL,
      musicUrl: 'https://r2.nsmusic.com.br/faixa1.mp3',
      musicUrl2: 'https://r2.nsmusic.com.br/faixa2.mp3'
    };

    const req = new Request(`https://nsmusic.com.br/api/suno/status?taskId=${taskId}`);
    const res = await GET(req);
    const json = await res.json();

    expect(json.status).toBe('COMPLETED');
    expect(json.tracks).toHaveLength(2);
    expect(json.tracks[0].audioUrl).toBe('https://r2.nsmusic.com.br/faixa1.mp3');
  });

  it('GET /api/suno/status mantém PROCESSING enquanto robô ainda está dentro do prazo', async () => {
    const taskId = 'suno_local_ped-2';
    store[taskId] = {
      orderId: 'ped-2',
      provider: PROVIDER_SUNO_LOCAL,
      status: 'PROCESSING',
      createdAt: new Date().toISOString()
    };
    store['ped-2'] = {
      id: 'ped-2',
      sunoProvider: PROVIDER_SUNO_LOCAL,
      sunoRequestedAt: new Date().toISOString()
    };

    const req = new Request(`https://nsmusic.com.br/api/suno/status?taskId=${taskId}`);
    const res = await GET(req);
    const json = await res.json();

    expect(json.status).toBe('PROCESSING');
    expect(json.provider).toBe(PROVIDER_SUNO_LOCAL);
  });
});
