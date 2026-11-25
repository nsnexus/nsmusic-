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
