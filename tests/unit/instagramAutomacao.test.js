import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Supabase em memória: só a tabela `config`, com o mínimo que o módulo usa.
const store = {};
vi.mock('../../src/lib/supabase-edge.js', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      let chave = null;
      const q = {
        select: () => q,
        eq: (_col, v) => { chave = v; return q; },
        maybeSingle: async () => ({ data: store[chave] ? { valor: store[chave] } : null, error: null }),
        upsert: async (row) => { store[row.chave] = JSON.parse(JSON.stringify(row.valor)); return { data: [row], error: null }; },
      };
      return q;
    },
  }),
}));

const decisoes = [];
vi.mock('../../src/lib/gemini.js', () => ({
  runJsonCompletion: vi.fn(async () => {
    const d = decisoes.shift();
    if (d instanceof Error) throw d;
    return d || { acao: 'ignorar' };
  }),
}));

import {
  selecionarPendentes,
  selecionarParaRevisao,
  normalizarDecisao,
  normalizarConfig,
  podarTratados,
  executarAutomacao,
  CHAVE_CONFIG,
  CHAVE_ESTADO,
} from '../../src/lib/instagramAutomacao.js';
import { isGraphId, explicarErroMeta } from '../../src/lib/instagramGraph.js';

const AGORA = Date.parse('2026-11-16T12:00:00Z');
const c = (id, extra = {}) => ({
  id, texto: 'Que lindo, como faço?', usuario: 'maria', data: '2026-11-16T11:00:00Z', oculto: false, respostas: [], ...extra,
});

describe('selecionarPendentes', () => {
  const base = { proprioUsuario: '_nsmusic', desdeIso: '2026-11-16T10:00:00Z', tratados: {}, agora: AGORA };

  it('aceita comentário novo, sem resposta', () => {
    expect(selecionarPendentes([c('1')], base).map((x) => x.id)).toEqual(['1']);
  });

  it('descarta oculto, próprio, já tratado e já respondido por nós', () => {
    const lista = [
      c('1', { oculto: true }),
      c('2', { usuario: '_NSMusic' }),
      c('3'),
      c('4', { respostas: [{ id: '9', usuario: '_nsmusic', texto: 'oi' }] }),
      c('5', { respostas: [{ id: '8', usuario: 'outra_pessoa', texto: 'tb quero' }] }),
    ];
    const r = selecionarPendentes(lista, { ...base, tratados: { 3: 'x' } });
    expect(r.map((x) => x.id)).toEqual(['5']);
  });

  it('nunca pega comentário anterior ao momento em que a automação foi ligada', () => {
    expect(selecionarPendentes([c('1', { data: '2026-11-16T09:59:00Z' })], base)).toEqual([]);
  });

  it('espera o comentário ter pelo menos 1 minuto', () => {
    expect(selecionarPendentes([c('1', { data: '2026-11-16T11:59:30Z' })], base)).toEqual([]);
  });

  it('sem saber o nosso @, qualquer resposta existente conta como atendido', () => {
    const lista = [c('1', { respostas: [{ id: '8', usuario: 'alguem', texto: 'oi' }] }), c('2')];
    expect(selecionarPendentes(lista, { ...base, proprioUsuario: '' }).map((x) => x.id)).toEqual(['2']);
  });

  it('descarta comentário sem texto ou sem data válida', () => {
    expect(selecionarPendentes([c('1', { texto: '  ' }), c('2', { data: null })], base)).toEqual([]);
  });
});

describe('normalizarDecisao', () => {
  it('responder exige texto e corta resposta longa', () => {
    expect(normalizarDecisao({ acao: 'responder', resposta: '' }).acao).toBe('ignorar');
    const r = normalizarDecisao({ acao: 'RESPONDER', resposta: `a\n b ${'x'.repeat(600)}` });
    expect(r.acao).toBe('responder');
    expect(r.resposta.length).toBe(400);
    expect(r.resposta.startsWith('a b ')).toBe(true);
  });

  it('ocultar vira ignorar quando a opção está desligada', () => {
    expect(normalizarDecisao({ acao: 'ocultar' }, { ocultarOfensivos: true }).acao).toBe('ocultar');
    expect(normalizarDecisao({ acao: 'ocultar' }, { ocultarOfensivos: false }).acao).toBe('ignorar');
  });

  it('qualquer coisa fora do combinado vira ignorar', () => {
    expect(normalizarDecisao(null).acao).toBe('ignorar');
    expect(normalizarDecisao({ acao: 'apagar', resposta: 'x' }).acao).toBe('ignorar');
  });
});

describe('normalizarConfig / podarTratados / helpers da Graph', () => {
  it('aplica padrões e limites', () => {
    const cfg = normalizarConfig({ maxPorExecucao: 999, igUserId: 'abc', igUsername: '@_nsmusic', ligada: 'sim' });
    expect(cfg.maxPorExecucao).toBe(20);
    expect(cfg.igUserId).toBe('');
    expect(cfg.igUsername).toBe('_nsmusic');
    expect(cfg.ligada).toBe(false);
    expect(cfg.ocultarOfensivos).toBe(true);
    expect(cfg.instrucoes.length).toBeGreaterThan(20);
  });

  it('poda mantendo os mais recentes', () => {
    const r = podarTratados({ a: '2026-01-01', b: '2026-03-01', c: '2026-02-01' }, 2);
    expect(Object.keys(r).sort()).toEqual(['b', 'c']);
  });

  it('isGraphId só aceita numérico', () => {
    expect(isGraphId('17895695668004550')).toBe(true);
    expect(isGraphId('123/../me')).toBe(false);
    expect(isGraphId('')).toBe(false);
  });

  it('explica erro sem repassar a mensagem da Meta', () => {
    expect(explicarErroMeta({ code: 190, message: 'segredo' })).toMatch(/expirou/);
    expect(explicarErroMeta({ code: 10 })).toMatch(/permissão/);
    expect(explicarErroMeta({ code: 999, message: 'segredo' })).not.toMatch(/segredo/);
  });
});

describe('executarAutomacao', () => {
  let chamadas;
  const comentariosDaMidia = {
    '111111': [
      { id: '900001', text: 'Quero uma pra minha mãe!', username: 'maria', timestamp: '2026-11-16T11:00:00Z', hidden: false },
      { id: '900002', text: 'lixo de perfil, vai se f...', username: 'troll', timestamp: '2026-11-16T11:05:00Z', hidden: false },
      { id: '900003', text: 'comentário antigo', username: 'joao', timestamp: '2026-11-10T11:00:00Z', hidden: false },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AGORA);
    for (const k of Object.keys(store)) delete store[k];
    decisoes.length = 0;
    chamadas = [];
    store[CHAVE_CONFIG] = {
      accessToken: 'T'.repeat(60), igUserId: '555555', igUsername: '_nsmusic',
      ligada: true, ligadaEm: '2026-11-16T10:00:00Z', incluirAnuncios: false, maxPorExecucao: 8,
    };
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      const u = new URL(url);
      chamadas.push({ method: init.method || 'GET', path: u.pathname, body: init.body ? Object.fromEntries(init.body) : null });
      const json = (data) => ({ ok: true, status: 200, json: async () => data });
      if (u.pathname.endsWith('/555555/media')) return json({ data: [{ id: '111111', caption: 'Reel', comments_count: 3, timestamp: '2026-11-15T00:00:00Z' }] });
      if (u.pathname.endsWith('/111111/comments')) return json({ data: comentariosDaMidia['111111'] });
      if (init.method === 'POST') return json({ id: '777777', success: true });
      return json({});
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  const posts = () => chamadas.filter((x) => x.method === 'POST');

  it('desligada não chama a Meta', async () => {
    store[CHAVE_CONFIG].ligada = false;
    const r = await executarAutomacao({});
    expect(r.motivo).toBe('desligada');
    expect(chamadas).toEqual([]);
  });

  it('responde, oculta e ignora o antigo; segunda passada não repete', async () => {
    decisoes.push({ acao: 'responder', resposta: 'Que homenagem linda! O link tá na bio 💛' }, { acao: 'ocultar' });
    const r = await executarAutomacao({});
    expect(r.ok).toBe(true);
    expect(r.resumo).toMatchObject({ responder: 1, ocultar: 1, falhas: 0 });
    expect(posts()).toEqual([
      { method: 'POST', path: '/v21.0/900001/replies', body: { message: 'Que homenagem linda! O link tá na bio 💛' } },
      { method: 'POST', path: '/v21.0/900002', body: { hide: 'true' } },
    ]);
    expect(Object.keys(store[CHAVE_ESTADO].tratados).sort()).toEqual(['900001', '900002']);
    expect(store[CHAVE_ESTADO].historico).toHaveLength(2);
    expect(store[CHAVE_ESTADO].contagens['111111']).toBe(3);

    chamadas.length = 0;
    const r2 = await executarAutomacao({});
    expect(r2.acoes).toEqual([]);
    // Contagem do post não mudou: nem abre os comentários de novo.
    expect(chamadas.map((x) => x.path)).toEqual(['/v21.0/555555/media']);
  });

  it('simulação não publica nem grava estado', async () => {
    decisoes.push({ acao: 'responder', resposta: 'oi' }, { acao: 'ocultar' });
    const r = await executarAutomacao({ simular: true });
    expect(r.simular).toBe(true);
    expect(r.acoes.map((a) => a.acao)).toEqual(['responder', 'ocultar']);
    expect(posts()).toEqual([]);
    expect(store[CHAVE_ESTADO]).toBeUndefined();
  });

  it('IA fora do ar: não marca como tratado, tenta na próxima', async () => {
    decisoes.push(new Error('timeout'), { acao: 'ignorar' });
    const r = await executarAutomacao({});
    expect(r.resumo.falhas).toBe(1);
    expect(posts()).toEqual([]);
    expect(Object.keys(store[CHAVE_ESTADO].tratados)).toEqual(['900002']);
    expect(store[CHAVE_ESTADO].contagens['111111']).toBeUndefined();
  });

  it('respeita o teto por passada', async () => {
    store[CHAVE_CONFIG].maxPorExecucao = 1;
    decisoes.push({ acao: 'responder', resposta: 'oi' });
    const r = await executarAutomacao({});
    expect(r.acoes).toHaveLength(1);
    expect(r.resumo.naFila).toBe(1);
    expect(store[CHAVE_ESTADO].contagens['111111']).toBeUndefined();
  });

  it('token expirado ao responder: marca falha e tenta de novo depois', async () => {
    decisoes.push({ acao: 'responder', resposta: 'oi' }, { acao: 'ignorar' });
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, init = {}) => {
      if (init.method === 'POST') return { ok: false, status: 400, json: async () => ({ error: { code: 190, message: 'Session expired' } }) };
      return original(url, init);
    }));
    const r = await executarAutomacao({});
    expect(r.resumo.falhas).toBe(1);
    expect(r.acoes[0].motivo).toMatch(/expirou/);
    expect(store[CHAVE_ESTADO].tratados['900001']).toBeUndefined();
  });

  it('reclamação: responde primeiro e depois oculta', async () => {
    decisoes.push({ acao: 'responder_e_ocultar', resposta: 'Poxa, desculpa! Chama a gente em nsmusic.ia.br/suporte que resolvemos na hora.' }, { acao: 'ocultar' });
    const r = await executarAutomacao({});
    expect(r.resumo).toMatchObject({ responderEOcultar: 1, ocultar: 1, falhas: 0 });
    expect(posts().filter((x) => x.path.includes('900001'))).toEqual([
      { method: 'POST', path: '/v21.0/900001/replies', body: { message: 'Poxa, desculpa! Chama a gente em nsmusic.ia.br/suporte que resolvemos na hora.' } },
      { method: 'POST', path: '/v21.0/900001', body: { hide: 'true' } },
    ]);
  });

  it('revisão: reclamação já respondida e visível é ocultada uma vez, sem nova resposta', async () => {
    comentariosDaMidia['111111'].push({
      id: '900004', text: 'paguei e não recebi nada, golpe', username: 'ana', timestamp: '2026-11-12T11:00:00Z', hidden: false,
      replies: { data: [{ id: '1', text: 'Desculpa! Chama no suporte.', username: '_nsmusic', timestamp: '2026-11-12T12:00:00Z' }] },
    });
    store[CHAVE_ESTADO] = { tratados: { 900001: 'x', 900002: 'x' }, contagens: { 111111: 4 } };
    // 900002 ("lixo de perfil", já tratado) também entra na revisão: a IA decide deixar.
    decisoes.push({ acao: 'ignorar' }, { acao: 'responder_e_ocultar', resposta: 'oi' });
    const r = await executarAutomacao({});
    expect(r.resumo.ocultadasNaRevisao).toBe(1);
    expect(posts()).toEqual([{ method: 'POST', path: '/v21.0/900004', body: { hide: 'true' } }]);
    expect(store[CHAVE_ESTADO].revisados['900004']).toBeTruthy();
    expect(store[CHAVE_ESTADO].ultimaRevisao).toBeTruthy();

    chamadas.length = 0;
    await executarAutomacao({});
    expect(posts()).toEqual([]);
    comentariosDaMidia['111111'].pop();
  });

  it('com a opção desligada, reclamação só recebe resposta', async () => {
    store[CHAVE_CONFIG].ocultarReclamacoes = false;
    decisoes.push({ acao: 'responder_e_ocultar', resposta: 'Desculpa! Chama no suporte.' }, { acao: 'ignorar' });
    const r = await executarAutomacao({});
    expect(r.resumo).toMatchObject({ responder: 1, responderEOcultar: 0 });
    expect(posts()).toEqual([{ method: 'POST', path: '/v21.0/900001/replies', body: { message: 'Desculpa! Chama no suporte.' } }]);
  });
});

describe('reclamações', () => {
  it('normalizarDecisao: responder_e_ocultar exige resposta; sem ela vira ocultar', () => {
    expect(normalizarDecisao({ acao: 'responder_e_ocultar', resposta: 'oi' }).acao).toBe('responder_e_ocultar');
    expect(normalizarDecisao({ acao: 'responder_e_ocultar' }).acao).toBe('ocultar');
    expect(normalizarDecisao({ acao: 'responder_e_ocultar', resposta: 'oi' }, { ocultarReclamacoes: false }).acao).toBe('responder');
  });

  it('selecionarParaRevisao: só reclamação visível que já tem resposta', () => {
    const resp = [{ usuario: '_nsmusic' }];
    const lista = [
      c('1', { texto: 'não recebi minha música', respostas: resp }),
      c('2', { texto: 'não recebi minha música' }),
      c('3', { texto: 'que linda!', respostas: resp }),
      c('4', { texto: 'golpe!!', respostas: resp, oculto: true }),
      c('5', { texto: 'cadê minha música?', respostas: resp }),
    ];
    expect(selecionarParaRevisao(lista, { proprioUsuario: '_nsmusic', revisados: { 5: 'x' } }).map((x) => x.id)).toEqual(['1']);
  });
});
