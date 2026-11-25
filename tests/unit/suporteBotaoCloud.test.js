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
