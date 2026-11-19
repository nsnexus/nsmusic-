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

import { tempoDigitando, variar } from '../../src/lib/humanizar.js';
import { interpretarOpcao, interpretarEscolha, dataHoraBr, lerMensagemEvolution, selecionarMusicasPagas, tratarMensagemAdm, pedidoLiberado, arquivosValidos, VERSOES_OUTROS, CHAVE_ADM } from '../../src/lib/whatsappAdm.js';

function evento(texto, extra = {}) {
  return { event: 'messages.upsert', data: { key: { id: `m${Math.random()}`, fromMe: false, remoteJid: '5511999990000@s.whatsapp.net', ...extra }, message: { conversation: texto } } };
}

let chamadas;
let lidas;
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store[CHAVE_ADM] = { ligada: true, instanceName: 'nsmusic-adm' };
  pedidos = [];
  chamadas = [];
  lidas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    // "Marcar como lida" fica numa lista à parte: os testes abaixo olham só o que o cliente recebe.
    if (String(url).includes('/chat/markMessageAsRead/')) { lidas.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({}) }; }
    chamadas.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('interpretarOpcao', () => {
  it('só aceita 1, 3, 4 ou 5 sozinhos', () => {
    expect(interpretarOpcao(' 3 ')).toBe('3');
    expect(interpretarOpcao('4.')).toBe('4');
    expect(interpretarOpcao('3️⃣')).toBe('3');
    expect(interpretarOpcao('1')).toBe('1');
    expect(interpretarOpcao('5')).toBe('5');
    expect(interpretarOpcao('2')).toBeNull();
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

describe('escolha de pedido', () => {
  it('interpreta número da lista e TODAS', () => {
    expect(interpretarEscolha('2', 3)).toBe(2);
    expect(interpretarEscolha('2️⃣', 3)).toBe(2);
    expect(interpretarEscolha('4', 3)).toBeNull();
    expect(interpretarEscolha('Todas', 3)).toBe('todas');
    expect(interpretarEscolha('todos os pedidos', 3)).toBe('todas');
    expect(interpretarEscolha('quero a 2', 3)).toBeNull();
  });

  it('data no horário de Brasília', () => {
    expect(dataHoraBr('2026-11-16T20:13:00Z')).toBe('16/11/2026 às 17:13');
  });
});

describe('fluxo novo do robô', () => {
  const pago = (id, criado, extra = {}) => ({ id, orderNumber: `NS-${id}`, honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['a', 'b'], createdAt: criado, ...extra });
  const textos = () => chamadas.filter((c) => c.url.includes('/sendText/')).map((c) => c.body.text);
  const midias = () => chamadas.filter((c) => c.url.includes('/sendMedia/'));

  it('opção 1 pergunta o que ajustar', async () => {
    const r = await tratarMensagemAdm(evento('1'));
    expect(r.acao).toBe('ajuste');
    expect(textos()[0]).toMatch(/Letra/);
    expect(textos()[0]).toMatch(/Ritmo/);
  });

  it('opção 5 pergunta o motivo do contato', async () => {
    const r = await tratarMensagemAdm(evento('5'));
    expect(r.acao).toBe('outros');
    // O texto é sorteado entre as versões (jeito humano).
    expect(VERSOES_OUTROS).toContain(textos()[0]);
  });

  it('um pedido pago: diz código e data, depois manda os arquivos', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z')];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 2 });
    expect(textos()[0]).toContain('NS-A1');
    expect(textos()[0]).toContain('16/11/2026 às 17:13');
    expect(midias()).toHaveLength(2);
  });

  it('vários pedidos: manda a lista e não manda arquivo', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z'), pago('B2', '2026-11-10T12:00:00Z'), { id: 'X', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r).toMatchObject({ acao: 'lista', total: 2 });
    expect(textos()[0]).toMatch(/1️⃣ \*NS-A1\*/);
    expect(textos()[0]).toMatch(/2️⃣ \*NS-B2\*/);
    expect(textos()[0]).toContain('TODAS');
    expect(midias()).toHaveLength(0);
  });

  it('depois da lista, "2" manda só o segundo pedido (e não vira opção do menu)', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z'), pago('B2', '2026-11-10T12:00:00Z', { audioFiles: ['x'] })];
    await tratarMensagemAdm(evento('3'));
    chamadas.length = 0;
    const r = await tratarMensagemAdm(evento('2'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 1 });
    expect(midias()[0].body.media).toContain('orderId=B2');
  });

  it('"3" na lista escolhe o pedido 3, não reabre o menu', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z'), pago('B2', '2026-11-10T12:00:00Z'), pago('C3', '2026-11-01T12:00:00Z', { audioFiles: ['z'] })];
    await tratarMensagemAdm(evento('3'));
    chamadas.length = 0;
    const r = await tratarMensagemAdm(evento('3'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 1 });
    expect(midias()[0].body.media).toContain('orderId=C3');
  });

  it('"TODAS" manda os arquivos de todos os pedidos da lista', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z'), pago('B2', '2026-11-10T12:00:00Z')];
    await tratarMensagemAdm(evento('3'));
    chamadas.length = 0;
    const r = await tratarMensagemAdm(evento('todas'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 4 });
  });

  it('escolha vale uma vez: depois volta ao normal', async () => {
    pedidos = [pago('A1', '2026-11-16T20:13:00Z'), pago('B2', '2026-11-10T12:00:00Z')];
    await tratarMensagemAdm(evento('3'));
    await tratarMensagemAdm(evento('1'));
    chamadas.length = 0;
    expect((await tratarMensagemAdm(evento('2'))).acao).toBe('ignorada');
  });
});

describe('comando do dono e envio em áudio', () => {
  const pago = (id, extra = {}) => ({ id, orderNumber: `NS-${id}`, honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['a', 'b'], createdAt: '2026-11-16T20:13:00Z', ...extra });
  const doDono = (texto) => evento(texto, { fromMe: true });

  it('reconhece só o comando /musicas vindo do dono', () => {
    expect(lerMensagemEvolution(doDono('/musicas')).comandoDono).toBe(true);
    expect(lerMensagemEvolution(doDono('#Músicas')).comandoDono).toBe(true);
    expect(lerMensagemEvolution(doDono('Vou liberar e mandar suas músicas aqui'))).toBeNull();
    expect(lerMensagemEvolution(doDono('3'))).toBeNull();
    expect(lerMensagemEvolution(evento('/musicas')).comandoDono).toBeUndefined(); // cliente digitando não vale
  });

  it('/musicas: apaga o comando e manda MP3 + áudio, sem esperar o intervalo', async () => {
    pedidos = [pago('A1')];
    await tratarMensagemAdm(evento('3')); // cliente já pediu agora há pouco
    chamadas.length = 0;
    const r = await tratarMensagemAdm(doDono('/musicas'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 2, audios: 2 });
    expect(chamadas.some((c) => c.url.includes('/chat/deleteMessageForEveryone/'))).toBe(true);
    expect(chamadas.filter((c) => c.url.includes('/message/sendMedia/'))).toHaveLength(2);
    const audios = chamadas.filter((c) => c.url.includes('/message/sendWhatsAppAudio/'));
    expect(audios).toHaveLength(2);
    expect(audios[0].body.audio).toContain('/api/audio/proxy?orderId=A1');
  });

  it('/musicas sem pedido pago não manda nada ao cliente', async () => {
    pedidos = [{ id: 'x', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }];
    const r = await tratarMensagemAdm(doDono('/musicas'));
    expect(r.acao).toBe('sem_pedido_pago');
    expect(chamadas.filter((c) => c.url.includes('/message/'))).toHaveLength(0);
  });
});

describe('música bônus', () => {
  const principal = { id: 'P1', orderNumber: 'NS-P1', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['a', 'b'], createdAt: '2026-11-17T18:00:00Z' };
  // Bônus gerada antes de o principal ser pago: ficou "aguardando pagamento" no banco.
  const bonus = { id: 'B1', orderNumber: 'NS-B1', honoreeName: 'Ana', paymentStatus: 'AGUARDANDO_PAGAMENTO', isSecondGeneration: true, parentOrderId: 'P1', paidAmount: 0, audioFiles: ['c', 'd'], createdAt: '2026-11-17T18:20:00Z' };

  it('bônus vale quando o principal está pago (como na página de entrega)', () => {
    expect(pedidoLiberado(bonus, [principal, bonus])).toBe(true);
    expect(pedidoLiberado(bonus, [{ ...principal, paymentStatus: 'AGUARDANDO_PAGAMENTO' }, bonus])).toBe(false);
    expect(pedidoLiberado(bonus, [bonus])).toBe(false);
  });

  it('principal + bônus: manda as 4 versões direto, sem lista', async () => {
    pedidos = [principal, bonus];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r).toMatchObject({ acao: 'musicas', enviados: 4, audios: 4 });
    const midias = chamadas.filter((c) => c.url.includes('/message/sendMedia/')).map((c) => c.body.media);
    expect(midias.some((m) => m.includes('orderId=P1'))).toBe(true);
    expect(midias.some((m) => m.includes('orderId=B1'))).toBe(true);
    expect(chamadas[0].body.text).toContain('+ 🎁 música bônus');
  });

  it('dois pedidos, um com bônus: a lista mostra 2 itens e o item com bônus manda os dois', async () => {
    const outro = { id: 'P2', orderNumber: 'NS-P2', honoreeName: 'Bia', paymentStatus: 'PAGO', audioFiles: ['x'], createdAt: '2026-11-10T12:00:00Z' };
    pedidos = [principal, bonus, outro];
    const lista = await tratarMensagemAdm(evento('3'));
    expect(lista).toMatchObject({ acao: 'lista', total: 2 });
    chamadas.length = 0;
    const r = await tratarMensagemAdm(evento('1')); // item 1 = NS-P1 (+ bônus), o mais novo
    expect(r).toMatchObject({ acao: 'musicas', enviados: 4 });
  });
});

describe('jeito humano (Evolution)', () => {
  it('marca como lida e manda o texto com "digitando…" (delay)', async () => {
    await tratarMensagemAdm(evento('4'));
    expect(lidas).toHaveLength(1);
    expect(lidas[0].readMessages[0]).toMatchObject({ remoteJid: '5511999990000@s.whatsapp.net', fromMe: false });
    expect(chamadas[0].body.delay).toBeGreaterThanOrEqual(1200);
  });

  it('em silêncio não marca como lida (o dono vê a mensagem pendente)', async () => {
    pedidos = [{ id: 'x', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }];
    await tratarMensagemAdm(evento('3'));
    await tratarMensagemAdm(evento('oi'));
    expect(lidas).toHaveLength(0);
  });

  it('áudio sai com "gravando…" e o MP3 com um tempinho antes', async () => {
    pedidos = [{ id: 'pago1', paymentStatus: 'PAGO', audioFiles: ['a'] }];
    await tratarMensagemAdm(evento('3'));
    const audio = chamadas.find((c) => c.url.includes('/sendWhatsAppAudio/'));
    const doc = chamadas.find((c) => c.url.includes('/sendMedia/'));
    expect(audio.body.delay).toBeGreaterThanOrEqual(2000);
    expect(doc.body.delay).toBeGreaterThanOrEqual(1000);
  });

  it('passou do teto de arquivos da hora: avisa o cliente e não manda mídia', async () => {
    store.adm_arquivos_hora = { hora: new Date().toISOString().slice(0, 13), n: 60 };
    pedidos = [{ id: 'pago1', paymentStatus: 'PAGO', audioFiles: ['a'] }];
    const r = await tratarMensagemAdm(evento('3'));
    expect(r.limiteHora).toBe(true);
    expect(chamadas.filter((c) => c.url.includes('/sendMedia/'))).toHaveLength(0);
    expect(chamadas).toHaveLength(1);
  });

  it('tempo de digitação cresce com o texto e fica entre ~1,2 s e 6 s', () => {
    expect(tempoDigitando('oi')).toBeGreaterThanOrEqual(1200);
    expect(tempoDigitando('x'.repeat(5000))).toBeLessThanOrEqual(6000);
    expect(variar(['a'])).toBe('a');
    expect(variar('só uma')).toBe('só uma');
  });

  it('a continuação só aceita arquivos do proxy de áudio do site', () => {
    const ok = arquivosValidos([
      { url: 'https://nsmusic.ia.br/api/audio/proxy?orderId=1&faixa=0', fileName: 'a.mp3' },
      { url: 'https://malicioso.com/x.mp3', fileName: 'b.mp3' },
      { url: 'https://nsmusic.ia.br/api/audio/proxy?orderId=1&faixa=1' },
    ]);
    expect(ok).toHaveLength(1);
  });
});
