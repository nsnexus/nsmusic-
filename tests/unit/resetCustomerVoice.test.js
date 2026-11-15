import { describe, it, expect, vi, beforeEach } from 'vitest';

let mock;
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => mock }));

import { resetCustomerVoice } from '@/lib/customerVoices';

function criarMock({ voices = [], config = [], erroUpdate = null }) {
  const db = { customer_voices: voices, config };
  return {
    db,
    from(tabela) {
      const q = { tabela, filtros: [], acao: 'select', patch: null };
      const linhas = () => db[tabela].filter((r) => q.filtros.every(([c, vals]) => vals.includes(r[c])));
      const exec = () => {
        if (q.acao === 'update') {
          if (erroUpdate && tabela === 'customer_voices') return { data: null, error: { message: erroUpdate } };
          const alvo = linhas();
          alvo.forEach((r) => Object.assign(r, q.patch));
          return { data: alvo.map((r) => ({ ...r })), error: null };
        }
        return { data: linhas().map((r) => ({ ...r })), error: null };
      };
      // Igual ao supabase-edge real: filtros encadeados antes; update() é terminal e devolve Promise.
      const api = {
        select() { return api; },
        in(c, vals) { q.filtros.push([c, vals]); return api; },
        eq(c, v) { q.filtros.push([c, [v]]); return api; },
        update(patch) { q.acao = 'update'; q.patch = patch; return Promise.resolve(exec()); },
        then(res, rej) { return Promise.resolve(exec()).then(res, rej); },
      };
      return api;
    },
  };
}

describe('resetCustomerVoice', () => {
  beforeEach(() => { mock = null; });

  it('marca como redefinido e limpa o voice_id', async () => {
    mock = criarMock({ voices: [{ phone: '5511999998888', status: 'ativo', voice_id: 'v1' }] });
    const res = await resetCustomerVoice('(11) 99999-8888');
    expect(res.ok).toBe(true);
    expect(mock.db.customer_voices[0]).toMatchObject({ status: 'redefinido', voice_id: '' });
  });

  it('acha o registro mesmo gravado sem o 55', async () => {
    mock = criarMock({ voices: [{ phone: '11999998888', status: 'ativo', voice_id: 'v1' }] });
    const res = await resetCustomerVoice('11999998888');
    expect(res.ok).toBe(true);
    expect(mock.db.customer_voices[0].status).toBe('redefinido');
  });

  it('não diz sucesso quando o banco recusa a alteração', async () => {
    mock = criarMock({ voices: [{ phone: '5511999998888', status: 'ativo', voice_id: 'v1' }], erroUpdate: 'violates check constraint' });
    const res = await resetCustomerVoice('5511999998888');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/check constraint/);
  });

  it('não diz sucesso quando não existe timbre', async () => {
    mock = criarMock({});
    const res = await resetCustomerVoice('5511999998888');
    expect(res.ok).toBe(false);
  });

  it('também redefine o espelho na tabela config', async () => {
    mock = criarMock({ config: [{ chave: 'voice_5511999998888', valor: { status: 'ativo', voiceId: 'v1' } }] });
    const res = await resetCustomerVoice('5511999998888');
    expect(res.ok).toBe(true);
    expect(mock.db.config[0].valor).toMatchObject({ status: 'redefinido', voiceId: '' });
  });
});
