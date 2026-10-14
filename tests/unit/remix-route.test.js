import { describe, it, expect, vi, beforeEach } from 'vitest';

const configStore = new Map();

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => ({
          limit: vi.fn(async () => {
            const v = configStore.get(val);
            return { data: v ? [{ chave: val, valor: v }] : [], error: null };
          })
        }))
      })),
      upsert: vi.fn(async ({ chave, valor }) => {
        configStore.set(chave, valor);
        return { error: null };
      })
    }))
  }))
}));

const { POST } = await import('@/app/api/admin/remix/route');

describe('/api/admin/remix route', () => {
  beforeEach(() => {
    configStore.clear();
    process.env.KIE_API_KEY = 'test-kie-key';
    vi.restoreAllMocks();
  });

  it('retorna 400 se uploadUrl não for informada no create', async () => {
    const req = {
      json: async () => ({ action: 'create', style: 'Rock' })
    };

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('uploadUrl');
  });

  it('cria tarefa de upload-and-cover na Kie.ai com sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('createTask')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: { taskId: 'remix-task-12345' }
          })
        };
      }
      return { ok: false, status: 404 };
    }));

    process.env.KIE_API_KEY = 'test-kie-key';

    const req = {
      json: async () => ({
        action: 'create',
        uploadUrl: 'https://r2.dev/original.mp3',
        style: 'Sertanejo acústico',
        title: 'Música do Cliente (Remix)',
        model: 'V5_5',
        instrumental: false
      })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.taskId).toBe('remix-task-12345');
  });

  it('retorna 400 se taskId não for fornecido no status', async () => {
    const req = {
      json: async () => ({ action: 'status' })
    };

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('taskId');
  });

  it('retorna faixas geradas do remix quando a Kie.ai conclui', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('recordInfo')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 200,
            data: {
              state: 'SUCCESS',
              resultJson: JSON.stringify({
                data: [
                  { id: 'track-1', audio_url: 'https://r2.dev/remix-v1.mp3', title: 'Remix 1' },
                  { id: 'track-2', audio_url: 'https://r2.dev/remix-v2.mp3', title: 'Remix 2' }
                ]
              })
            }
          })
        };
      }
      return { ok: false, status: 404 };
    }));

    process.env.KIE_API_KEY = 'test-kie-key';

    const req = {
      json: async () => ({ action: 'status', taskId: 'remix-task-12345' })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe('SUCCESS');
    expect(data.tracks.length).toBe(2);
  });
});
