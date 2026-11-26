import { describe, it, expect, vi, afterEach } from 'vitest';
import { entregarMusicasNoWhatsapp, pedidoDoPayload, payloadReceberMusicas, mesmoTelefone } from '@/lib/entregaMusicasWhatsapp';
import { pedidosDeEntrega, remetentesDoNumeroOficial } from '@/lib/suporteBotaoCloud';
import { sendCloudApiTemplate, enviarPagamentoConfirmadoCloud, modeloEntregaParaMeta } from '@/lib/whatsappCloudApi';

// Botão "Receber minhas músicas" do aviso de pagamento: as músicas chegam em áudio no WhatsApp oficial.

const ID = 'abcdefghijklmnopqrst';
const pedido = { id: ID, customerPhone: '(94) 99123-4567', honoreeName: 'João', paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['a', 'b'] };
const faixas = [{ url: `/api/audio/proxy?orderId=${ID}&faixa=0&download=v1.mp3`, nome: 'v1.mp3' }, { url: `/api/audio/proxy?orderId=${ID}&faixa=1&download=v2.mp3`, nome: 'v2.mp3' }];

function deps(over = {}) {
  return {
    getOrder: vi.fn(async () => pedido),
    faixasParaEntregar: vi.fn(async () => ({ liberado: true, faixas })),
    enviarMensagemCloud: vi.fn(async () => ({ success: true })),
    enviarBotaoSuporteCloud: vi.fn(async () => ({ success: true })),
    reservarEnvio: vi.fn(async () => true),
    ...over,
  };
}

describe('payload e telefone', () => {
  it('lê o id do pedido só do payload do botão de receber músicas', () => {
    expect(pedidoDoPayload(payloadReceberMusicas(ID))).toBe(ID);
    expect(pedidoDoPayload('outra_coisa')).toBe('');
    expect(pedidoDoPayload('receber_musicas:../../x')).toBe('');
  });

  it('reconhece o mesmo número com e sem o nono dígito', () => {
    expect(mesmoTelefone('559491234567', '(94) 99123-4567')).toBe(true);
    expect(mesmoTelefone('5594991234567', '94991234567')).toBe(true);
    expect(mesmoTelefone('5511991234567', '94991234567')).toBe(false);
  });
});

describe('entregarMusicasNoWhatsapp', () => {
  it('pedido pago: manda o texto, os áudios (link absoluto do proxy) e o botão do pedido', async () => {
    const d = deps();
    const r = await entregarMusicasNoWhatsapp('559491234567', ID, { NEXT_PUBLIC_SITE_URL: 'https://nsmusic.ia.br' }, d);
    expect(r).toEqual({ enviado: true, audios: 2 });
    const tipos = d.enviarMensagemCloud.mock.calls.map((c) => c[1].type);
    expect(tipos).toEqual(['text', 'audio', 'audio', 'interactive']);
    expect(d.enviarMensagemCloud.mock.calls[1][1].audio.link).toBe(`https://nsmusic.ia.br${faixas[0].url}`);
    expect(d.enviarMensagemCloud.mock.calls[3][1].interactive.action.parameters.url).toBe(`https://nsmusic.ia.br/entrega?orderId=${ID}`);
  });

  it('número diferente do pedido não recebe as músicas', async () => {
    const d = deps();
    const r = await entregarMusicasNoWhatsapp('5511988887777', ID, {}, d);
    expect(r.motivo).toBe('telefone_diferente');
    expect(d.enviarMensagemCloud).not.toHaveBeenCalled();
  });

  it('pedido não pago não recebe as músicas (vai o botão do atendimento)', async () => {
    const d = deps({ faixasParaEntregar: vi.fn(async () => ({ liberado: false, faixas: [] })) });
    const r = await entregarMusicasNoWhatsapp('559491234567', ID, {}, d);
    expect(r.motivo).toBe('nao_pago');
    expect(d.enviarMensagemCloud).not.toHaveBeenCalled();
    expect(d.enviarBotaoSuporteCloud).toHaveBeenCalled();
  });

  it('toque repetido não manda as músicas de novo', async () => {
    const d = deps({ reservarEnvio: vi.fn(async () => false) });
    const r = await entregarMusicasNoWhatsapp('559491234567', ID, {}, d);
    expect(r.motivo).toBe('ja_enviado');
    expect(d.enviarMensagemCloud).not.toHaveBeenCalled();
  });
});

describe('webhook do número oficial', () => {
  const corpo = (mensagens) => ({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ value: { metadata: { phone_number_id: 'PN' }, messages: mensagens } }] }],
  });

  it('separa o toque em "Receber minhas músicas" das mensagens comuns', () => {
    const body = corpo([
      { from: '559491234567', type: 'button', button: { payload: payloadReceberMusicas(ID), text: 'Receber minhas músicas' } },
      { from: '5511988887777', type: 'text', text: { body: 'oi' } },
    ]);
    expect(pedidosDeEntrega(body, 'PN')).toEqual([{ de: '559491234567', orderId: ID }]);
    expect(remetentesDoNumeroOficial(body, 'PN')).toEqual(['559491234567', '5511988887777']);
    expect(pedidosDeEntrega(body, 'OUTRO')).toEqual([]);
  });
});

describe('aviso de pagamento com os botões', () => {
  afterEach(() => vi.unstubAllGlobals());
  const env = { WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: 'PN', NEXT_PUBLIC_SITE_URL: 'https://nsmusic.ia.br' };

  it('manda o payload com o pedido no botão de resposta e o id no botão de link', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ messages: [{ id: 'x' }] }) }));
    vi.stubGlobal('fetch', fetchMock);
    await sendCloudApiTemplate('94991234567', 'entrega_musicas_nsmusic', ['Maria'], { botoes: [{ tipo: 'quick_reply', payload: payloadReceberMusicas(ID) }, { tipo: 'url', parametro: ID }] }, env);
    const corpoEnviado = JSON.parse(fetchMock.mock.calls[0][1].body);
    const botoes = corpoEnviado.template.components.filter((c) => c.type === 'button');
    expect(botoes).toEqual([
      { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: `receber_musicas:${ID}` }] },
      { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: ID }] },
    ]);
  });

  it('tenta o modelo de entrega primeiro e, se a Meta ainda não aprovou, usa o aviso de sempre', async () => {
    const nomes = [];
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const nome = JSON.parse(init.body).template.name;
      nomes.push(nome);
      return nome === 'entrega_musicas_nsmusic'
        ? { ok: false, status: 404, json: async () => ({ error: { message: 'Template name does not exist' } }) }
        : { ok: true, json: async () => ({ messages: [{ id: 'x' }] }) };
    }));
    const r = await enviarPagamentoConfirmadoCloud('94991234567', { cliente: 'Maria', homenageado: 'João', orderId: ID }, env);
    expect(r.success).toBe(true);
    expect(nomes[0]).toBe('entrega_musicas_nsmusic');
    expect(nomes[1]).toBe('confirmacao_pagamento_v2');
  });

  it('modelo para a Meta: utilidade, resposta rápida antes do link do pedido', () => {
    const m = modeloEntregaParaMeta();
    expect(m.category).toBe('UTILITY');
    const botoes = m.components.find((c) => c.type === 'BUTTONS').buttons;
    expect(botoes.map((b) => b.type)).toEqual(['QUICK_REPLY', 'URL']);
    expect(botoes[1].url).toBe('https://nsmusic.ia.br/entrega?orderId={{1}}');
  });
});
