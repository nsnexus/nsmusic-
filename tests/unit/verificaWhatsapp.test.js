import { describe, it, expect, vi } from 'vitest';
import {
  variacoesParaConsulta,
  interpretarResposta,
  consultarEvolution,
  verificarWhatsapp,
  telefoneValidoParaConsulta,
  LIMITE_POR_IP_HORA,
} from '../../src/lib/verificaWhatsapp.js';

// Cache da Cloudflare em memória (match/put com Response).
function cacheFalso() {
  const dados = new Map();
  return {
    dados,
    match: async (k) => (dados.has(k) ? new Response(dados.get(k)) : undefined),
    put: async (k, res) => { dados.set(k, await res.text()); },
  };
}
const EVO = { baseUrl: 'https://evo.exemplo', instanceName: 'consulta', token: 'chave' };
const resposta = (json, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => json });

describe('variacoesParaConsulta', () => {
  it('com 9: consulta também sem o 9 (conta antiga)', () => {
    expect(variacoesParaConsulta('94981262610')).toEqual(['5594981262610', '559481262610']);
  });
  it('sem 9: consulta também com o 9 (cliente esqueceu)', () => {
    expect(variacoesParaConsulta('9481262610')).toEqual(['559481262610', '5594981262610']);
  });
  it('formato inválido não consulta', () => {
    expect(variacoesParaConsulta('123')).toEqual([]);
    expect(telefoneValidoParaConsulta('01981262610')).toBe(false);
  });
});

describe('interpretarResposta', () => {
  it('qualquer variação existindo = tem', () => {
    expect(interpretarResposta([{ exists: false }, { exists: true }])).toBe('tem');
  });
  it('todas dizendo que não = nao_tem', () => {
    expect(interpretarResposta([{ exists: false }, { exists: false }])).toBe('nao_tem');
  });
  it('resposta estranha = desconhecido', () => {
    expect(interpretarResposta({ erro: 'x' })).toBe('desconhecido');
    expect(interpretarResposta([{ number: '1' }])).toBe('desconhecido');
  });
});

describe('consultarEvolution', () => {
  it('chama whatsappNumbers da instância com as variações', async () => {
    const fetchImpl = vi.fn(async () => resposta([{ exists: true }]));
    expect(await consultarEvolution('94981262610', EVO, { fetchImpl })).toBe('tem');
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://evo.exemplo/chat/whatsappNumbers/consulta');
    expect(init.headers.apikey).toBe('chave');
    expect(JSON.parse(init.body)).toEqual({ numbers: ['5594981262610', '559481262610'] });
  });
  it('erro ou queda da Evolution vira desconhecido (nunca lança)', async () => {
    expect(await consultarEvolution('94981262610', EVO, { fetchImpl: async () => resposta({}, false) })).toBe('desconhecido');
    expect(await consultarEvolution('94981262610', EVO, { fetchImpl: async () => { throw new Error('rede'); } })).toBe('desconhecido');
  });
});

describe('verificarWhatsapp', () => {
  it('guarda a resposta: o mesmo número não é consultado de novo', async () => {
    const cache = cacheFalso();
    const fetchImpl = vi.fn(async () => resposta([{ exists: false }, { exists: false }]));
    const a = await verificarWhatsapp('94981262610', { ip: '1.1.1.1', evo: EVO, cache, fetchImpl });
    const b = await verificarWhatsapp('94981262610', { ip: '2.2.2.2', evo: EVO, cache, fetchImpl });
    expect(a).toEqual({ resultado: 'nao_tem', motivo: 'consulta' });
    expect(b).toEqual({ resultado: 'nao_tem', motivo: 'cache' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    // Telefone nunca aparece em claro na chave do cache.
    expect([...cache.dados.keys()].join(' ')).not.toContain('94981262610');
  });

  it('limite por IP: depois do teto não consulta mais a Evolution', async () => {
    const cache = cacheFalso();
    const fetchImpl = vi.fn(async () => resposta([{ exists: true }]));
    let ultimo;
    for (let i = 0; i <= LIMITE_POR_IP_HORA; i++) {
      ultimo = await verificarWhatsapp(`9498126${String(1000 + i)}`, { ip: '3.3.3.3', evo: EVO, cache, fetchImpl });
    }
    expect(ultimo).toEqual({ resultado: 'desconhecido', motivo: 'limite' });
    expect(fetchImpl).toHaveBeenCalledTimes(LIMITE_POR_IP_HORA);
  });

  it('sem Evolution configurada responde desconhecido', async () => {
    expect(await verificarWhatsapp('94981262610', { ip: '4.4.4.4', evo: null, cache: cacheFalso() }))
      .toEqual({ resultado: 'desconhecido', motivo: 'sem_evolution' });
  });

  it('resposta desconhecida não é guardada (tenta de novo depois)', async () => {
    const cache = cacheFalso();
    const fetchImpl = vi.fn(async () => resposta({}, false));
    await verificarWhatsapp('94981262610', { ip: '5.5.5.5', evo: EVO, cache, fetchImpl });
    await verificarWhatsapp('94981262610', { ip: '5.5.5.5', evo: EVO, cache, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
