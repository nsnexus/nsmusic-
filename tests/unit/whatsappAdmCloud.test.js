import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';

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

import { CHAVE_ADM, tratarMensagemAdm } from '../../src/lib/whatsappAdm.js';
import {
  configCloudAdm, assinaturaValida, ehWebhookDoAdm, mensagensDoWebhook, processarRequisicaoCloudAdm,
} from '../../src/lib/whatsappAdmCloud.js';

const ENV = { WHATSAPP_ADM_PHONE_NUMBER_ID: '9990001', WHATSAPP_ACCESS_TOKEN: 'tok-teste', WHATSAPP_APP_SECRET: 'segredo-do-app' };

function webhook(mensagens, { phoneNumberId = '9990001', extra = {} } = {}) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: phoneNumberId }, ...extra, messages: mensagens } }] }],
  };
}
const texto = (corpo, id = `wamid.${Math.random()}`, from = '558188442208') => ({ from, id, type: 'text', text: { body: corpo } });

let chamadas;
beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
  store[CHAVE_ADM] = { ligada: true };
  pedidos = [];
  chamadas = [];
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    chamadas.push({ url: String(url), headers: init.headers, body: init.body ? JSON.parse(init.body) : null });
    return { ok: true, status: 200, json: async () => ({}) };
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe('configCloudAdm', () => {
  it('só ativa com o id do número e um token', () => {
    expect(configCloudAdm({})).toBeNull();
    expect(configCloudAdm({ WHATSAPP_ADM_PHONE_NUMBER_ID: '1' })).toBeNull();
    expect(configCloudAdm({ WHATSAPP_ACCESS_TOKEN: 't' })).toBeNull();
    expect(configCloudAdm(ENV)).toMatchObject({ tipo: 'cloud', phoneNumberId: '9990001', token: 'tok-teste' });
  });
  it('token próprio do ADM tem prioridade sobre o do número de disparo', () => {
    expect(configCloudAdm({ ...ENV, WHATSAPP_ADM_ACCESS_TOKEN: 'tok-adm' }).token).toBe('tok-adm');
  });
});

describe('assinaturaValida', () => {
  const corpo = '{"a":1}';
  const assinar = (c, s) => `sha256=${createHmac('sha256', s).update(c).digest('hex')}`;
  it('aceita a assinatura correta', async () => {
    expect(await assinaturaValida(corpo, assinar(corpo, 'segredo'), 'segredo')).toBe(true);
  });
  it('recusa corpo alterado, segredo errado, ausente ou mal formada', async () => {
    expect(await assinaturaValida('{"a":2}', assinar(corpo, 'segredo'), 'segredo')).toBe(false);
    expect(await assinaturaValida(corpo, assinar(corpo, 'outro'), 'segredo')).toBe(false);
    expect(await assinaturaValida(corpo, '', 'segredo')).toBe(false);
    expect(await assinaturaValida(corpo, 'sha256=abc', 'segredo')).toBe(false);
    expect(await assinaturaValida(corpo, assinar(corpo, 'segredo'), '')).toBe(false);
  });
});

describe('leitura do webhook da Meta', () => {
  it('reconhece o número ADM e ignora outros números', () => {
    expect(ehWebhookDoAdm(webhook([texto('3')]), '9990001')).toBe(true);
    expect(ehWebhookDoAdm(webhook([texto('3')], { phoneNumberId: '555' }), '9990001')).toBe(false);
    expect(ehWebhookDoAdm({ event: 'messages.upsert' }, '9990001')).toBe(false);
  });
  it('só devolve mensagens de texto; status e mídia ficam de fora', () => {
    const body = webhook([
      texto('3', 'wamid.1'),
      { from: '5511999990000', id: 'wamid.2', type: 'image', image: { id: 'x' } },
    ], { extra: { statuses: [{ id: 'wamid.s', status: 'delivered' }] } });
    expect(mensagensDoWebhook(body, '9990001')).toEqual([{ id: 'wamid.1', jid: '558188442208', telefone: '558188442208', texto: '3' }]);
    expect(mensagensDoWebhook(webhook([texto('3')], { phoneNumberId: '555' }), '9990001')).toEqual([]);
  });
});

describe('robô do ADM pelo canal oficial', () => {
  const musicas = () => { pedidos = [{ id: 'pago1', paymentStatus: 'PAGAMENTO_APROVADO', honoreeName: 'Roberto', audioFiles: ['a', 'b'] }]; };
  const msg = (t) => ({ cloudMsg: { id: `wamid.${Math.random()}`, jid: '558188442208', telefone: '558188442208', texto: t } });

  it('"3" manda a abertura e cada música como áudio, só pela API da Meta', async () => {
    musicas();
    const r = await tratarMensagemAdm(msg('3'), ENV);
    expect(r).toMatchObject({ acao: 'musicas', enviados: 2, audios: 2, total: 2 });

    // Nenhuma chamada à Evolution; tudo vai para o número ADM na Graph API, com o token.
    expect(chamadas.every((c) => c.url.startsWith('https://graph.facebook.com/') && c.url.endsWith('/9990001/messages'))).toBe(true);
    expect(chamadas.every((c) => c.headers.Authorization === 'Bearer tok-teste')).toBe(true);
    expect(chamadas.every((c) => c.body.to === '558188442208' && c.body.messaging_product === 'whatsapp')).toBe(true);

    const tipos = chamadas.map((c) => c.body.type);
    expect(tipos).toEqual(['text', 'text', 'audio', 'text', 'audio']); // abertura, rótulo+áudio, rótulo+áudio
    expect(chamadas.some((c) => c.body.type === 'document')).toBe(false);
    expect(chamadas[2].body.audio.link).toContain('/api/audio/proxy?orderId=pago1&faixa=0');
  });

  it('uma única música vai sem rótulo', async () => {
    pedidos = [{ id: 'pago1', paymentStatus: 'PAGO', audioFiles: ['a'] }];
    await tratarMensagemAdm(msg('3'), ENV);
    expect(chamadas.map((c) => c.body.type)).toEqual(['text', 'audio']);
  });

  it('"4" manda o link de criação e segundo "3" seguido não reenvia', async () => {
    const r = await tratarMensagemAdm(msg('4'), ENV);
    expect(r.acao).toBe('link');
    expect(chamadas[0].body.text.body).toContain('/criar');

    musicas();
    await tratarMensagemAdm(msg('3'), ENV);
    const antes = chamadas.length;
    expect((await tratarMensagemAdm(msg('3'), ENV)).acao).toBe('aguardando');
    expect(chamadas.length).toBe(antes);
  });

  it('o mesmo id de mensagem (reentrega da Meta) não é tratado duas vezes', async () => {
    const m = msg('4');
    expect((await tratarMensagemAdm(m, ENV)).acao).toBe('link');
    expect((await tratarMensagemAdm(m, ENV)).acao).toBe('duplicada');
    expect(chamadas).toHaveLength(1);
  });

  it('texto livre fica em silêncio', async () => {
    expect((await tratarMensagemAdm(msg('Obgda'), ENV)).acao).toBe('ignorada');
    expect(chamadas).toHaveLength(0);
  });

  it('sem pedido pago não manda nada', async () => {
    pedidos = [{ id: 'x', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }];
    expect((await tratarMensagemAdm(msg('3'), ENV)).acao).toBe('sem_pedido_pago');
    expect(chamadas).toHaveLength(0);
  });

  it('se a Meta recusar o envio, devolve falha em vez de dizer que enviou', async () => {
    musicas();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 131047 } }) })));
    const r = await tratarMensagemAdm(msg('3'), ENV);
    expect(r.acao).toBe('falha');
    expect(r.enviados).toBe(0);
  });
});

describe('processarRequisicaoCloudAdm', () => {
  const requisicao = (corpo, { assinatura } = {}) => {
    const bruto = typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
    const sig = assinatura === undefined ? `sha256=${createHmac('sha256', ENV.WHATSAPP_APP_SECRET).update(bruto).digest('hex')}` : assinatura;
    return { text: async () => bruto, headers: { get: (n) => (n.toLowerCase() === 'x-hub-signature-256' ? sig : null) } };
  };

  it('canal oficial desligado: não mexe em nada', async () => {
    expect(await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')])), {})).toBeNull();
  });

  it('corpo de outro número ou que não é JSON: deixa a rota seguir o fluxo normal', async () => {
    expect(await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')], { phoneNumberId: '555' })), ENV)).toBeNull();
    expect(await processarRequisicaoCloudAdm(requisicao('não é json'), ENV)).toBeNull();
  });

  it('assinatura inválida: 401 e nada é enviado', async () => {
    const r = await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')]), { assinatura: `sha256=${'0'.repeat(64)}` }), ENV);
    expect(r.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it('sem WHATSAPP_APP_SECRET: recusa (500) citando o nome da variável', async () => {
    const { WHATSAPP_APP_SECRET, ...semSegredo } = ENV;
    const r = await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')])), semSegredo);
    expect(r.status).toBe(500);
    expect(r.json.error).toContain('WHATSAPP_APP_SECRET');
    expect(chamadas).toHaveLength(0);
  });

  it('webhook válido: responde 200 e trata a mensagem', async () => {
    const r = await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')])), ENV);
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].body.text.body).toContain('/criar');
  });

  it('com waitUntil, responde na hora e entrega o trabalho para ele', async () => {
    const pendentes = [];
    const r = await processarRequisicaoCloudAdm(requisicao(webhook([texto('4')])), ENV, (p) => pendentes.push(p));
    expect(r.status).toBe(200);
    expect(pendentes).toHaveLength(1);
    await Promise.all(pendentes);
    expect(chamadas).toHaveLength(1);
  });
});
