import { describe, it, expect, vi } from 'vitest';
import { enviarBotaoSuporteParaCliente } from '@/lib/suporteBotaoCloud';

// Número oficial: quem escreve recebe o botão "Continuar conversa" (no máximo 1x a cada 6 h).

function supabaseCom(ultimo) {
  const upsert = vi.fn(async () => ({ error: null }));
  return {
    upsert,
    cliente: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ultimo ? { valor: { at: ultimo } } : null }) }) }),
        upsert,
      }),
    },
  };
}

describe('enviarBotaoSuporteParaCliente', () => {
  it('manda o botão com o pedido mais recente e registra o envio', async () => {
    const sb = supabaseCom(null);
    const enviar = vi.fn(async () => ({ success: true }));
    const r = await enviarBotaoSuporteParaCliente('5594991234567', {}, {
      getSupabaseEdge: () => sb.cliente,
      findRecentOrderByPhone: async () => ({ id: 'abcdefghijklmnopqrst' }),
      enviarBotaoSuporteCloud: enviar,
    });
    expect(r.enviado).toBe(true);
    expect(enviar).toHaveBeenCalledWith('5594991234567', { orderId: 'abcdefghijklmnopqrst' }, {});
    expect(sb.upsert).toHaveBeenCalled();
  });

  it('cliente com pedido pago: logo abaixo vai o botão "Quero minhas músicas"', async () => {
    const sb = supabaseCom(null);
    const mensagem = vi.fn(async () => ({ success: true }));
    const pago = { id: 'abcdefghijklmnopqrst', honoreeName: 'João Silva', paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['a'], createdAt: '2026-11-20T10:00:00Z' };
    const naoPago = { id: 'zzzzzzzzzzzzzzzzzzzz', honoreeName: 'Ana', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'], createdAt: '2026-11-21T10:00:00Z' };
    await enviarBotaoSuporteParaCliente('5594991234567', {}, {
      getSupabaseEdge: () => sb.cliente,
      findRecentOrderByPhone: async () => pago,
      enviarBotaoSuporteCloud: vi.fn(async () => ({ success: true })),
      findOrdersByPhone: async () => [naoPago, pago],
      enviarMensagemCloud: mensagem,
    });
    const conteudo = mensagem.mock.calls[0][1];
    expect(conteudo.interactive.type).toBe('button');
    expect(conteudo.interactive.body.text).toMatch(/João Silva/);
    expect(conteudo.interactive.action.buttons).toEqual([{ type: 'reply', reply: { id: 'receber_musicas:abcdefghijklmnopqrst', title: 'Quero minhas músicas' } }]);
  });

  it('sem pedido pago, só vai o botão do suporte', async () => {
    const sb = supabaseCom(null);
    const mensagem = vi.fn(async () => ({ success: true }));
    await enviarBotaoSuporteParaCliente('5594991234567', {}, {
      getSupabaseEdge: () => sb.cliente,
      findRecentOrderByPhone: async () => null,
      enviarBotaoSuporteCloud: vi.fn(async () => ({ success: true })),
      findOrdersByPhone: async () => [{ id: 'zzzzzzzzzzzzzzzzzzzz', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['a'] }],
      enviarMensagemCloud: mensagem,
    });
    expect(mensagem).not.toHaveBeenCalled();
  });

  it('não repete o botão dentro de 6 horas', async () => {
    const sb = supabaseCom(new Date(Date.now() - 60 * 60 * 1000).toISOString());
    const enviar = vi.fn(async () => ({ success: true }));
    const r = await enviarBotaoSuporteParaCliente('5594991234567', {}, {
      getSupabaseEdge: () => sb.cliente, findRecentOrderByPhone: async () => null, enviarBotaoSuporteCloud: enviar,
    });
    expect(r).toEqual({ enviado: false, motivo: 'botao_ja_enviado' });
    expect(enviar).not.toHaveBeenCalled();
  });
});

import { remetentesDoNumeroOficial, processarWebhookNumeroOficial } from '@/lib/suporteBotaoCloud';

const webhookMeta = (phoneNumberId, mensagens = [{ from: '5594991234567', id: 'wamid.1', type: 'text', text: { body: 'Oi' } }]) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { metadata: { phone_number_id: phoneNumberId }, messages: mensagens } }] }],
});

describe('remetentesDoNumeroOficial', () => {
  it('pega quem escreveu para o número oficial e ignora outros números e status', () => {
    expect(remetentesDoNumeroOficial(webhookMeta('111'), '111')).toEqual(['5594991234567']);
    expect(remetentesDoNumeroOficial(webhookMeta('222'), '111')).toEqual([]);
    expect(remetentesDoNumeroOficial(webhookMeta('111', null), '111')).toEqual([]);
  });
});

describe('processarWebhookNumeroOficial', () => {
  const env = { WHATSAPP_ACCESS_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '111' };

  it('corpo de outro número (ou da Evolution) devolve null para o fluxo seguir', async () => {
    expect(await processarWebhookNumeroOficial(JSON.stringify(webhookMeta('222')), null, env)).toBeNull();
    expect(await processarWebhookNumeroOficial(JSON.stringify({ event: 'messages.upsert', data: {} }), null, env)).toBeNull();
  });

  it('com segredo configurado, recusa assinatura inválida', async () => {
    const r = await processarWebhookNumeroOficial(JSON.stringify(webhookMeta('111')), 'sha256=' + '0'.repeat(64), { ...env, WHATSAPP_APP_SECRET: 's' });
    expect(r.status).toBe(401);
  });

  it('status de entrega (sem mensagem) não gera envio', async () => {
    const r = await processarWebhookNumeroOficial(JSON.stringify(webhookMeta('111', null)), null, env);
    expect(r.json.ignored).toBe('sem_mensagem');
  });
});

describe('botoesDeEntrega', () => {
  it('um botão por pedido pago (até 3), título com no máximo 20 caracteres', async () => {
    const { botoesDeEntrega } = await import('@/lib/suporteChat');
    const p = (id, nome, dia) => ({ id: id.repeat(20), honoreeName: nome, paymentStatus: 'PAGO', audioFiles: ['a'], createdAt: `2026-11-${dia}T10:00:00Z` });
    const b = botoesDeEntrega([p('a', 'Maximiliano Souza', 20), p('b', 'Ana', 21), p('c', 'Rui', 22), p('d', 'Bia', 23)]);
    expect(b).toHaveLength(3);
    expect(b.every((x) => x.titulo.length <= 20 && x.id.startsWith('receber_musicas:'))).toBe(true);
  });
});
