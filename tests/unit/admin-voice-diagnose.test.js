import { describe, it, expect, vi, beforeEach } from 'vitest';

let allowed = true;
let order;
let task;

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: () => ({ env: { KIE_API_KEY: 'test-secret' } }),
}));
vi.mock('@/lib/auth', () => ({
  requireAdmin: vi.fn(async () => allowed
    ? { ok: true, email: 'admin@exemplo.com' }
    : { ok: false, status: 401, error: 'Não autorizado' }),
}));
vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async () => order),
}));
vi.mock('@/lib/db', () => ({
  getTask: vi.fn(async () => task),
}));
vi.mock('@/lib/envValue', () => ({
  readEnvValue: vi.fn(() => 'test-secret'),
}));

const { POST } = await import('@/app/api/admin/voice/diagnose/route');

function request(useCustomVoice = true) {
  return new Request('https://nsmusic.ia.br/api/admin/voice/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 'order-voice', useCustomVoice }),
  });
}

beforeEach(() => {
  allowed = true;
  order = {
    id: 'order-voice',
    isCustomVoice: true,
    voiceType: 'minha_voz',
    customVoiceId: 'validation-task-id',
    sunoTaskId: 'song-task',
  };
  task = { result: { kieTaskApi: 'jobs' } };
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ code: 200, data: { isAvailable: true } }),
  }));
});

describe('diagnóstico grátis de voz na KIE', () => {
  it('bloqueia consulta não autorizada sem chamar a KIE', async () => {
    allowed = false;
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('envia somente check-voice e informa disponibilidade real', async () => {
    const res = await POST(request());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.voiceAvailable).toBe(true);
    expect(data.willUseClonedVoice).toBe(true);
    expect(data.lastGeneration).toBe('jobs');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.kie.ai/api/v1/jobs/createTask');
    expect(JSON.parse(options.body)).toEqual({
      model: 'ai-music-api/check-voice',
      input: { task_id: 'validation-task-id' },
    });
    expect(options.headers.Authorization).toBe('Bearer test-secret');
  });

  it('detecta flag antigo falso, mesmo com caixinha marcada', async () => {
    order.isCustomVoice = false;
    const res = await POST(request());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.voiceAvailable).toBe(true);
    expect(data.willUseClonedVoice).toBe(false);
    expect(data.reason).toMatch(/isCustomVoice=false/);
  });

  it('não confunde voz indisponível com voz disponível', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ code: 200, data: { isAvailable: false } }),
    });
    const res = await POST(request());
    expect((await res.json()).voiceAvailable).toBe(false);
  });

  it('não consulta a KIE quando o pedido não tem voiceId', async () => {
    order.customVoiceId = null;
    const res = await POST(request());
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.voiceAvailable).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
