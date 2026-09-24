import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  gerarNaVps,
  consultarClipesVps,
  consultarSaldoVps,
  avaliarClipes,
  configVpsUtilizavel,
  lerConfigVps,
} from '@/lib/sunoVps';

// A VPS é o provedor primário de geração desde 24/09/2026, com a Kie.ai de fallback. O que estes
// testes fixam é o CONTRATO com o resto do sistema: quando desistir da VPS, quando fechar um pedido
// e quando ainda falta clipe. Errar isso entrega ao cliente uma música em vez de duas, ou queima a
// geração inteira quando bastava cair para a Kie.ai.

const ENV = { SUNO_VPS_URL: 'https://suno.exemplo.com.br', SUNO_VPS_API_KEY: 'chave-de-teste' };

const respostaJson = (status, corpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => corpo,
});

describe('configuração da VPS', () => {
  it('recusa base URL sem https — a x-api-key viaja em toda geração', () => {
    const config = lerConfigVps({ SUNO_VPS_URL: 'http://81.17.98.66:3000', SUNO_VPS_API_KEY: 'k' });
    expect(config.configurado).toBe(true);
    expect(configVpsUtilizavel(config)).toBe(false);
  });

  it('sem variável configurada, o provedor se declara indisponível', () => {
    expect(configVpsUtilizavel(lerConfigVps({}))).toBe(false);
  });
});

describe('gerarNaVps', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('devolve os dois clipes e adota o primeiro como taskId', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, {
      ok: true,
      status: 'submitted',
      clips: [{ id: 'clipe-a' }, { id: 'clipe-b' }],
    }));

    const r = await gerarNaVps({ prompt: 'letra', tags: 'pop', title: 'Teste' }, ENV);
    expect(r).toMatchObject({ ok: true, taskId: 'clipe-a', clipIds: ['clipe-a', 'clipe-b'] });
  });

  it('402 INSUFFICIENT_CREDITS vira sinal de fallback, não erro genérico', async () => {
    global.fetch.mockResolvedValue(respostaJson(402, {
      ok: false,
      code: 'INSUFFICIENT_CREDITS',
      error: 'Créditos da conta Suno esgotados. Fallback recomendado.',
    }));

    const r = await gerarNaVps({ prompt: 'letra', tags: 'pop' }, ENV);
    expect(r.ok).toBe(false);
    expect(r.semCredito).toBe(true);
    expect(r.definitivo).toBe(true);
  });

  it('5xx é transitório; 4xx é definitivo', async () => {
    global.fetch.mockResolvedValue(respostaJson(503, { ok: false, error: 'indisponivel' }));
    expect((await gerarNaVps({ prompt: 'x', tags: 'y' }, ENV)).definitivo).toBe(false);

    global.fetch.mockResolvedValue(respostaJson(401, { ok: false, error: 'Unauthorized' }));
    expect((await gerarNaVps({ prompt: 'x', tags: 'y' }, ENV)).definitivo).toBe(true);
  });

  it('resposta 200 sem clipe nenhum não é sucesso', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, { ok: true, clips: [] }));
    expect((await gerarNaVps({ prompt: 'x', tags: 'y' }, ENV)).ok).toBe(false);
  });

  it('falha de rede não lança — devolve objeto para o chamador decidir', async () => {
    global.fetch.mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    const r = await gerarNaVps({ prompt: 'x', tags: 'y' }, ENV);
    expect(r.ok).toBe(false);
    expect(r.erro).toContain('TimeoutError');
  });

  it('manda o callBackUrl com a query string intacta', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, { ok: true, clips: [{ id: 'a' }, { id: 'b' }] }));
    const callbackUrl = 'https://nsmusic.ia.br/api/suno/webhook-vps?secret=abc&orderId=ped1';

    await gerarNaVps({ prompt: 'x', tags: 'y', callbackUrl }, ENV);

    const corpo = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(corpo.callBackUrl).toBe(callbackUrl);
    expect(global.fetch.mock.calls[0][1].headers['x-api-key']).toBe('chave-de-teste');
  });
});

describe('consultarClipesVps', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('aceita a resposta em array, que é o formato da API', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, [{ id: 'a', status: 'complete' }]));
    const r = await consultarClipesVps(['a'], ENV);
    expect(r.ok).toBe(true);
    expect(r.clipes).toHaveLength(1);
  });

  it('consulta os dois ids numa chamada só', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, []));
    await consultarClipesVps(['a', 'b'], ENV);
    expect(global.fetch.mock.calls[0][0]).toContain('ids=a%2Cb');
  });
});

describe('consultarSaldoVps', () => {
  beforeEach(() => { global.fetch = vi.fn(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('lê o saldo e a data de renovação', async () => {
    global.fetch.mockResolvedValue(respostaJson(200, {
      ok: true, credits_left: 2420, plan: 'Pro Plan', period_end: '2026-10-22T16:47:36Z',
    }));
    const r = await consultarSaldoVps(ENV);
    expect(r).toMatchObject({ ok: true, creditos: 2420, renovaEm: '2026-10-22T16:47:36Z' });
  });
});

describe('avaliarClipes', () => {
  const pronto = (id) => ({ id, status: 'complete', audio_url: `https://cdn1.suno.ai/${id}.mp3` });
  const falho = (id) => ({ id, status: 'error' });
  const gerando = (id) => ({ id, status: 'streaming' });

  it('não fecha com um clipe pronto e outro ainda gerando — o cliente pagou por duas versões', () => {
    const r = avaliarClipes([pronto('a'), gerando('b')], 2);
    expect(r.fechar).toBe(false);
    expect(r.totalPronto).toBe(1);
  });

  it('fecha quando os dois ficam prontos', () => {
    expect(avaliarClipes([pronto('a'), pronto('b')], 2).fechar).toBe(true);
  });

  it('fecha com um pronto e outro falhado — não há mais nada por vir', () => {
    const r = avaliarClipes([pronto('a'), falho('b')], 2);
    expect(r.fechar).toBe(true);
    expect(r.prontos).toHaveLength(1);
  });

  it('marca tudoFalhou quando nenhum clipe saiu', () => {
    const r = avaliarClipes([falho('a'), falho('b')], 2);
    expect(r.fechar).toBe(false);
    expect(r.tudoFalhou).toBe(true);
  });

  it('status complete sem audio_url não conta como pronto', () => {
    const r = avaliarClipes([{ id: 'a', status: 'complete' }, pronto('b')], 2);
    expect(r.totalPronto).toBe(1);
    expect(r.fechar).toBe(false);
  });
});
