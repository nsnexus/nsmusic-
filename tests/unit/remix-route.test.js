import { describe, it, expect, vi, beforeEach } from 'vitest';

const configStore = new Map();
const ordersStore = new Map();

vi.mock('@/lib/supabase-edge', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: vi.fn((table) => {
      if (table === 'orders') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col, val) => ({
              maybeSingle: vi.fn(async () => {
                const order = ordersStore.get(val);
                return { data: order || null, error: null };
              }),
              single: vi.fn(async () => {
                const order = ordersStore.get(val);
                return { data: order || null, error: order ? null : new Error('not found') };
              })
            }))
          })),
          eq: vi.fn((col, val) => ({
            update: vi.fn(async (fields) => {
              const existing = ordersStore.get(val) || {};
              ordersStore.set(val, { ...existing, ...fields });
              return { error: null };
            })
          }))
        };
      }
      return {
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
      };
    })
  }))
}));

vi.mock('@/lib/transcribeAudio', () => ({
  transcribeAudioWithFailover: vi.fn(async (source) => {
    if (!source || !source.value) return '';
    if (source.value.includes('error')) return '';
    return 'Se você me pedir pra ficar eu fico. Se você me pedir pra voltar eu volto.';
  })
}));

const { POST } = await import('@/app/api/admin/remix/route');

describe('/api/admin/remix route', () => {
  beforeEach(() => {
    configStore.clear();
    ordersStore.clear();
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

  it('cria tarefa de upload-and-cover na Kie.ai com sucesso e vincula dados do pedido', async () => {
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
        style: 'Sertanejo Universitário moderno',
        title: 'Música do Cliente (Remix)',
        model: 'V5_5',
        instrumental: false,
        orderId: 'order-abc-123',
        orderNumber: 'NS-8899',
        customerName: 'Narciso',
        customerPhone: '5511999998888',
        originalStyle: 'Pop'
      })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.taskId).toBe('remix-task-12345');
    expect(data.item.orderId).toBe('order-abc-123');
    expect(data.item.orderNumber).toBe('NS-8899');
    expect(data.item.customerName).toBe('Narciso');
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

  it('vincula faixa do remix ao pedido existente (attach_to_order)', async () => {
    ordersStore.set('order-123', {
      id: 'order-123',
      audio_url: 'https://r2.dev/antiga-faixa1.mp3',
      audio_files: ['https://r2.dev/antiga-faixa1.mp3']
    });

    const req = {
      json: async () => ({
        action: 'attach_to_order',
        orderId: 'order-123',
        trackUrl: 'https://r2.dev/nova-faixa-remix.mp3',
        asPrimary: true
      })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.audioUrl).toBe('https://r2.dev/nova-faixa-remix.mp3');
    expect(data.audioFiles).toContain('https://r2.dev/nova-faixa-remix.mp3');

    const updated = ordersStore.get('order-123');
    expect(updated.audio_url).toBe('https://r2.dev/nova-faixa-remix.mp3');
    expect(updated.audio_files[0]).toBe('https://r2.dev/nova-faixa-remix.mp3');
  });

  it('retorna 400 se audioUrl não for fornecida na ação transcribe', async () => {
    const req = {
      json: async () => ({ action: 'transcribe' })
    };

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('audioUrl');
  });

  it('identifica e formata versos de letra a partir do áudio com sucesso', async () => {
    const req = {
      json: async () => ({ action: 'transcribe', audioUrl: 'https://r2.dev/musica-voz.ogg' })
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.lyrics).toContain('Se você me pedir pra ficar');
    expect(data.lyrics.split('\n').length).toBeGreaterThan(1);
  });
});
