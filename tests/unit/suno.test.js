import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// src/lib/suno.js centraliza a chamada à Kie.ai e a retentativa automática quando ela reporta falha
// definitiva — consumido por api/suno/generate (clique manual), api/suno/status (retry em tempo
// real, cliente ainda na página) e api/orders/reconcile (retry por cron, cliente já saiu). Os testes
// aqui cobrem a política de quantas vezes retentar e o encadeamento de taskId, não o transporte HTTP
// em si (isso já é coberto indiretamente pelos mocks de fetch abaixo).

let store;

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: () => ({
      update: (data) => ({
        eq: (_col, val) => {
          if (store[val]) {
            store[val] = { ...store[val], retryTaskId: data.retry_task_id || data.retryTaskId };
          } else {
            store[val] = { retryTaskId: data.retry_task_id || data.retryTaskId };
          }
          return Promise.resolve({ data: null, error: null });
        }
      })
    })
  }))
}));

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => (store[id] ? { id, ...store[id] } : null)),
  updateOrder: vi.fn(async (id, data) => {
    const current = store[id] || {};
    const merged = { ...current };
    for (const [key, value] of Object.entries(data)) {
      merged[key] = (value && typeof value === 'object' && '__increment' in value)
        ? (Number(current[key]) || 0) + value.__increment
        : value;
    }
    store[id] = merged;
    return { success: true };
  }),
}));

const saveTaskMock = vi.fn(async (taskId, status, result, orderId) => {
  store[taskId] = { ...(store[taskId] || {}), status, result, orderId, updatedAt: new Date().toISOString() };
  return true;
});
const getTaskMock = vi.fn(async (taskId) => store[taskId] || null);
vi.mock('@/lib/db', () => ({
  saveTask: (...args) => saveTaskMock(...args),
  getTask: (...args) => getTaskMock(...args),
}));

const { requestSunoGeneration, resolveLatestTaskId, maybeAutoRetrySunoFailure } = await import('@/lib/suno');

function kieOkResponse(taskId) {
  return { ok: true, status: 200, json: async () => ({ code: 200, data: { taskId } }) };
}
function kieErrorResponse(status, code) {
  return { ok: status < 400, status, json: async () => ({ code, msg: 'erro simulado' }) };
}

beforeEach(() => {
  store = {};
  saveTaskMock.mockClear();
  getTaskMock.mockClear();
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('requestSunoGeneration', () => {
  it('caminho feliz: devolve taskId e marca o pedido como GERANDO_AUDIO', async () => {
    global.fetch.mockResolvedValue(kieOkResponse('task-abc'));
    store['order1'] = {};

    const result = await requestSunoGeneration({ orderId: 'order1', prompt: 'letra', tags: 'pop' }, { KIE_API_KEY: 'chave' });

    // provider passou a vir no retorno quando a geracao virou roteada (VPS primaria, Kie fallback).
    expect(result).toEqual({ ok: true, taskId: 'task-abc', provider: 'kie' });
    expect(store['order1'].productionStatus).toBe('GERANDO_AUDIO');
    expect(store['order1'].sunoGenerationCount).toBe(1); // increment() a partir de undefined
    expect(saveTaskMock).toHaveBeenCalledWith('task-abc', 'PROCESSING', null, 'order1', { provider: 'kie' }, expect.anything());
  });

  it('sem KIE_API_KEY: falha sem chamar a Kie.ai', async () => {
    const result = await requestSunoGeneration({ orderId: 'order1', prompt: 'x', tags: 'y' }, {});
    expect(result.ok).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('erro transitório (429) seguido de sucesso: insiste e retorna o taskId da tentativa boa', async () => {
    global.fetch
      .mockResolvedValueOnce(kieErrorResponse(429, 429))
      .mockResolvedValueOnce(kieOkResponse('task-retry-ok'));
    store['order2'] = {};

    const result = await requestSunoGeneration({ orderId: 'order2', prompt: 'letra', tags: 'pop' }, { KIE_API_KEY: 'chave' });

    expect(result).toEqual({ ok: true, taskId: 'task-retry-ok', provider: 'kie' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('limita falha transitória a duas chamadas para não exceder prazo da Pages', async () => {
    global.fetch.mockResolvedValue(kieErrorResponse(503, 503));
    store['order-timeout'] = {};

    const result = await requestSunoGeneration({ orderId: 'order-timeout', prompt: 'letra', tags: 'pop' }, { KIE_API_KEY: 'chave' });

    expect(result.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('erro definitivo (4xx não transitório): não insiste e registra a falha no pedido', async () => {
    global.fetch.mockResolvedValue(kieErrorResponse(400, 400));
    store['order3'] = {};

    const result = await requestSunoGeneration({ orderId: 'order3', prompt: 'letra', tags: 'pop' }, { KIE_API_KEY: 'chave' });

    expect(result.ok).toBe(false);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(store['order3'].sunoError).toBe('kie_400');
    expect(store['order3'].sunoErrorCount).toBe(1);
  });

  it('quando UNIFICALLY_API_KEY está configurada, gera pela Unifically como primária', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: 200, success: true, data: { task_id: 'unif-123', status: 'processing' } })
    });
    store['order-unif'] = {};

    const result = await requestSunoGeneration(
      { orderId: 'order-unif', prompt: 'letra unif', tags: 'sertanejo' },
      { UNIFICALLY_API_KEY: 'unif-key-secret', KIE_API_KEY: 'kie-key' }
    );

    expect(result).toEqual({ ok: true, taskId: 'unif-123', provider: 'unifically' });
    expect(store['order-unif'].productionStatus).toBe('GERANDO_AUDIO');
    expect(store['order-unif'].sunoProvider).toBe('unifically');
    expect(saveTaskMock).toHaveBeenCalledWith('unif-123', 'PROCESSING', null, 'order-unif', { provider: 'unifically' }, expect.anything());
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith('https://api.unifically.com/v1/tasks', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer unif-key-secret',
      })
    }));
  });

  it('quando Unifically falha, executa failover automático para Kie.ai', async () => {
    // 1ª chamada: Unifically falha (ex: 402 Insufficient Balance ou 500)
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 402,
      json: async () => ({ code: 402, error_message: 'Insufficient balance' })
    });
    // 2ª chamada: Failover para Kie.ai tem sucesso
    global.fetch.mockResolvedValueOnce(kieOkResponse('task-kie-fallback'));
    store['order-failover'] = {};

    const result = await requestSunoGeneration(
      { orderId: 'order-failover', prompt: 'letra failover', tags: 'rock' },
      { UNIFICALLY_API_KEY: 'unif-key', KIE_API_KEY: 'kie-key' }
    );

    expect(result).toEqual({ ok: true, taskId: 'task-kie-fallback', provider: 'kie' });
    expect(store['order-failover'].sunoProvider).toBe('kie');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    // Verificou que a primeira foi Unifically e a segunda foi Kie
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.unifically.com/v1/tasks');
    expect(global.fetch.mock.calls[1][0]).toBe('https://api.kie.ai/api/v1/generate');
  });
});

describe('resolveLatestTaskId', () => {
  it('sem retryTaskId: devolve o mesmo id recebido', async () => {
    store['task-1'] = { status: 'FAILED' };
    expect(await resolveLatestTaskId('task-1')).toBe('task-1');
  });

  it('segue um único salto de retentativa', async () => {
    store['task-1'] = { retryTaskId: 'task-2' };
    store['task-2'] = { status: 'PROCESSING' };
    expect(await resolveLatestTaskId('task-1')).toBe('task-2');
  });

  it('segue múltiplos saltos até a tarefa mais recente', async () => {
    store['task-1'] = { retryTaskId: 'task-2' };
    store['task-2'] = { retryTaskId: 'task-3' };
    store['task-3'] = { status: 'PROCESSING' };
    expect(await resolveLatestTaskId('task-1')).toBe('task-3');
  });

  it('nunca entra em loop infinito, mesmo com auto-referência', async () => {
    store['task-1'] = { retryTaskId: 'task-1' }; // bug hipotético: aponta pra si mesmo
    await expect(resolveLatestTaskId('task-1')).resolves.toBe('task-1');
  });
});

describe('maybeAutoRetrySunoFailure', () => {
  const orderBase = {
    productionStatus: 'GERANDO_AUDIO',
    story: 'Uma história qualquer com detalhes suficientes.',
    musicStyle: 'Sertanejo',
    musicMood: 'Alegre',
    voiceType: 'masculina',
  };

  it('retenta com sucesso e encadeia o taskId antigo para o novo', async () => {
    store['order1'] = { ...orderBase };
    global.fetch.mockResolvedValue(kieOkResponse('task-new'));

    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: 'order1', env: { KIE_API_KEY: 'x' }, reason: 'kie_status_FAILED' });

    expect(result).toEqual({ retried: true, newTaskId: 'task-new' });
    expect(store['task-old'].retryTaskId).toBe('task-new');
    expect(store['order1'].sunoAutoRetryCount).toBe(1);
    expect(store['order1'].sunoRetryReserved).toBe(false);
  });

  it('esgotado o limite de tentativas, não retenta e registra o motivo', async () => {
    store['order1'] = { ...orderBase, sunoAutoRetryCount: 3 }; // MAX_AUTO_RETRIES = 3

    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: 'order1', env: {}, reason: 'kie_status_FAILED' });

    expect(result.retried).toBe(false);
    expect(result.reason).toBe('limite_esgotado');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(store['order1'].sunoError).toContain('limite_retry_esgotado');
  });

  it('pedido já convergiu por outra via (webhook chegou): não retenta', async () => {
    store['order1'] = { ...orderBase, productionStatus: 'AUDIO_GERADO' };

    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: 'order1', env: {}, reason: 'kie_status_FAILED' });

    expect(result).toEqual({ retried: false, reason: 'ja_resolvido' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('já reservado por outra chamada concorrente: não dispara uma segunda retentativa', async () => {
    store['order1'] = { ...orderBase, sunoRetryReserved: true };

    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: 'order1', env: {}, reason: 'kie_status_FAILED' });

    expect(result).toEqual({ retried: false, reason: 'reservado_por_outra_chamada' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sem dados suficientes para remontar o pedido à Kie.ai: não retenta', async () => {
    store['order1'] = { productionStatus: 'GERANDO_AUDIO' }; // sem story/lyrics nem musicStyle

    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: 'order1', env: {}, reason: 'kie_status_FAILED' });

    expect(result.retried).toBe(false);
    expect(result.reason).toBe('payload_incompleto');
    expect(store['order1'].sunoRetryReserved).toBe(false); // reserva liberada, não fica travado
  });

  it('sem orderId: não retenta', async () => {
    const result = await maybeAutoRetrySunoFailure({ taskId: 'task-old', orderId: null, env: {}, reason: 'x' });
    expect(result).toEqual({ retried: false, reason: 'sem_order_id' });
  });
});
