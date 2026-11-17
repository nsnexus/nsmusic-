import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const store = {};
vi.mock('../../src/lib/supabase-edge.js', () => ({
  getSupabaseEdge: () => ({
    from: () => {
      let chave = null;
      const q = {
        select: () => q,
        eq: (_c, v) => { chave = v; return q; },
        maybeSingle: async () => ({ data: store[chave] ? { valor: store[chave] } : null, error: null }),
        upsert: async (row) => { store[row.chave] = JSON.parse(JSON.stringify(row.valor)); return { error: null }; },
      };
      return q;
    },
  }),
}));
vi.mock('../../src/lib/whatsapp.js', () => ({
  getEvolutionConfig: async () => ({ baseUrl: 'https://evo.test', token: 'chave', instanceName: 'principal', enabled: true }),
}));
let pedidos = [];
vi.mock('../../src/lib/orderLookup.js', () => ({ findOrdersByPhone: async () => pedidos }));

import { interpretarOpcao, lerMensagemEvolution, selecionarMusicasPagas, tratarMensagemAdm, CHAVE_ADM } from '../../src/lib/whatsappAdm.js';

function evento(texto, extra = {}) {
  return { event: 'messages.upsert', data: { key: { id: `m${Math.random()}`, fromMe: false, remoteJid: '5511999990000@s.whatsapp.net', ...extra }, message: { conversation: texto } } };
}

let chamadas;
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store[CHAVE_ADM] = { ligada: true, instanceName: 'nsmusic-adm' };
  pedidos = [];
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    chamadas.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('interpretarOpcao', () => {
  it('só aceita 3 ou 4 sozinhos', () => {
    expect(interpretarOpcao(' 3 ')).toBe('3');
    expect(interpretarOpcao('4.')).toBe('4');
    expect(interpretarOpcao('3️⃣')).toBe('3');
    expect(interpretarOpcao('1')).toBeNull();
    expect(interpretarOpcao('34')).toBeNull();
    expect(interpretarOpcao('quero a 3')).toBeNull();
  });
});

describe('lerMensagemEvolution', () => {
  it('ignora mensagem nossa, grupo e status', () => {
    expect(lerMensagemEvolution(evento('3', { fromMe: true }))).toBeNull();
    expect(lerMensagemEvolution(evento('3', { remoteJid: '123-456@g.us' }))).toBeNull();
    expect(lerMensagemEvolution(evento('3', { remoteJid: 'status@broadcast' }))).toBeNull();
  });
  it('com LID, usa o telefone real de remoteJidAlt', () => {
    const m = lerMensagemEvolution(evento('3', { remoteJid: '1830649@lid', remoteJidAlt: '5511988887777@s.whatsapp.net' }));
    expect(m.telefone).toBe('5511988887777');
  });
});

describe('selecionarMusicasPagas', () => {
  it('só entra pedido pago, com teto de arquivos', () => {
    const arquivos = selecionarMusicasPagas([
      { id: 'pago1', paymentStatus: 'PAGAMENTO_APROVADO', honoreeName: 'José', audioFiles: ['a', 'b'] },
      { id: 'naopago', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a', 'b'] },
      { id: 'pago2', paymentStatus: 'PAGO', audioFiles: ['a'] },
    ]);
    expect(arquivos.map((a) => a.orderId)).toEqual(['pago1', 'pago1', 'pago2']);
    expect(arquivos[0].fileName).toBe('Musica-Jose-versao-1.mp3');
    expect(arquivos[0].url).toContain('/api/audio/proxy?orderId=pago1&faixa=0');
  });
});

describe('tratarMensagemAdm', () => {
  it('opção 4 manda o link de criação', async () => {
    const r = await tratarMensagemAdm(evento('4'));
    expect(r.acao).toBe('link');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].url).toContain('/message/sendText/nsmusic-adm');
    expect(chamadas[0].body.text).toContain('/criar');
  });

  it('opção 3 manda os MP3 pagos como documento', async () => {
    pedidos = [{ id: 'pago1', paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['a', 'b'] }];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 2 });
    const midias = chamadas.filter((c) => c.url.includes('/message/sendMedia/'));
    expect(midias).toHaveLength(2);
    expect(midias[0].body.mediatype).toBe('document');
  });

  it('opção 3 sem pedido pago não manda nada', async () => {
    pedidos = [{ id: 'x', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r.acao).toBe('sem_pedido_pago');
    expect(chamadas).toHaveLength(0);
  });

  it('segundo "3" em seguida não reenvia tudo', async () => {
    pedidos = [{ id: 'pago1', paymentStatus: 'PAGO', audioFiles: ['a'] }];
    await tratarMensagemAdm(evento('3'));
    const antes = chamadas.length;
    const r = await tratarMensagemAdm(evento('3'));
    expect(r.acao).toBe('aguardando');
    expect(chamadas.length).toBe(antes);
  });

  it('qualquer outro texto, ou automação desligada, fica em silêncio', async () => {
    expect((await tratarMensagemAdm(evento('oi, tudo bem?'))).acao).toBe('ignorada');
    store[CHAVE_ADM].ligada = false;
    expect((await tratarMensagemAdm(evento('4'))).acao).toBe('ignorada');
    expect(chamadas).toHaveLength(0);
  });
});
