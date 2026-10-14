import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map();

vi.mock('@/lib/supabase-edge.js', () => ({
  getSupabaseEdge: vi.fn(() => ({
    from: vi.fn((table) => ({
      insert: vi.fn(async () => ({ error: null })),
      upsert: vi.fn(async ({ chave, valor }) => {
        store.set(chave, valor);
        return { error: null };
      }),
      select: vi.fn(() => ({
        eq: vi.fn((col, val) => ({
          limit: vi.fn(async () => {
            const item = store.get(val);
            return { data: item ? [{ chave: val, valor: item }] : [], error: null };
          })
        })),
        like: vi.fn((col, val) => ({
          order: vi.fn(() => ({
            limit: vi.fn(async () => {
              const items = [];
              for (const [k, v] of store.entries()) {
                if (k.startsWith('voiceinvite_')) {
                  items.push({ chave: k, valor: v, updated_at: v.updatedAt });
                }
              }
              return { data: items, error: null };
            })
          }))
        }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(async (col, val) => {
          store.delete(val);
          return { error: null };
        })
      }))
    }))
  }))
}));

const {
  generateInviteToken,
  createVoiceInvite,
  getVoiceInvite,
  listVoiceInvites,
  toggleVoiceInvite,
  updateVoiceInvite,
  deleteVoiceInvite
} = await import('@/lib/voiceInvites');

describe('voiceInvites library', () => {
  beforeEach(() => {
    store.clear();
  });

  it('generateInviteToken gera formato URL-safe começando com v_', () => {
    const token = generateInviteToken();
    expect(token).toMatch(/^v_[a-z0-9]+_[a-z0-9]+$/i);
  });

  it('createVoiceInvite salva convite ativo por padrão e sanitiza telefone', async () => {
    const res = await createVoiceInvite({
      customerName: 'Lucas Lima',
      phone: '(11) 98888-7777',
      notes: 'Teste'
    });

    expect(res.ok).toBe(true);
    expect(res.invite.customerName).toBe('Lucas Lima');
    expect(res.invite.phone).toBe('5511988887777');
    expect(res.invite.active).toBe(true);
    expect(res.invite.status).toBe('pendente');
    expect(res.invite.token).toBeDefined();

    const saved = store.get(`voiceinvite_${res.invite.token}`);
    expect(saved).toBeDefined();
    expect(saved.customerName).toBe('Lucas Lima');
  });

  it('toggleVoiceInvite permite desativar e reativar manualmente', async () => {
    const token = 'v_test_token_123';
    store.set(`voiceinvite_${token}`, {
      token,
      customerName: 'Ana',
      phone: '5511999990000',
      active: true,
      status: 'pendente'
    });

    // Desativa
    const resDeact = await toggleVoiceInvite(token, false);
    expect(resDeact.ok).toBe(true);
    expect(resDeact.invite.active).toBe(false);
    expect(resDeact.invite.status).toBe('desativado');

    // Reativa
    const resReact = await toggleVoiceInvite(token, true);
    expect(resReact.ok).toBe(true);
    expect(resReact.invite.active).toBe(true);
    expect(resReact.invite.status).toBe('pendente');
  });

  it('updateVoiceInvite atualiza status para concluido com voiceId', async () => {
    const token = 'v_finish_123';
    store.set(`voiceinvite_${token}`, {
      token,
      customerName: 'Carlos',
      phone: '5511987654321',
      active: true,
      status: 'pendente'
    });

    const res = await updateVoiceInvite(token, {
      voiceId: 'vid-999-suno',
      status: 'concluido',
      sampleAudioUrl: 'https://r2.dev/sample.webm'
    });

    expect(res.ok).toBe(true);
    expect(res.invite.voiceId).toBe('vid-999-suno');
    expect(res.invite.status).toBe('concluido');
    expect(res.invite.sampleAudioUrl).toBe('https://r2.dev/sample.webm');
  });

  it('deleteVoiceInvite remove convite do banco', async () => {
    const token = 'v_del_123';
    store.set(`voiceinvite_${token}`, {
      token,
      customerName: 'Remover'
    });

    const res = await deleteVoiceInvite(token);
    expect(res.ok).toBe(true);
    expect(store.has(`voiceinvite_${token}`)).toBe(false);
  });
});
