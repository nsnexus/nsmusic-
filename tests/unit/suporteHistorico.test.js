import { describe, it, expect, vi, beforeEach } from 'vitest';

// Histórico do chat de suporte: só grava o que conhece, com tamanho limitado, e nome/telefone vêm
// do pedido no servidor (nunca do corpo da requisição).

const rpc = vi.fn(async () => ({ error: null }));
vi.mock('@/lib/supabase-edge', () => ({ getSupabaseEdge: () => ({ rpc }) }));
vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async (id) => (id === 'abcdefghijklmnopqrst' ? { id, customerName: 'Maria', customerPhone: '(94) 99123-4567' } : null)),
}));

const { limparLote, registrarConversa } = await import('@/lib/suporteHistorico');
const ID = '3f2b1c9e-8a7d-4c6b-9e5f-1a2b3c4d5e6f';

beforeEach(() => rpc.mockClear());

describe('limparLote', () => {
  it('descarta tipo e remetente desconhecidos e corta texto longo', () => {
    const lote = limparLote([
      { de: 'eu', tipo: 'texto', texto: 'x'.repeat(5000) },
      { de: 'admin', tipo: 'texto', texto: 'falso' },
      { de: 'bot', tipo: 'script', texto: 'falso' },
      { de: 'bot', tipo: 'pix', titulo: 'Ajuste', texto: 'R$ 1,00', extra: 'ignorado' },
    ]);
    expect(lote).toHaveLength(2);
    expect(lote[0].texto).toHaveLength(4000);
    expect(lote[1]).not.toHaveProperty('extra');
  });
});

describe('registrarConversa', () => {
  it('recusa id de conversa inválido', async () => {
    expect((await registrarConversa({ conversaId: 'x', mensagens: [] })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('nome e telefone vêm do pedido, marcas desconhecidas são ignoradas', async () => {
    await registrarConversa({
      conversaId: ID, orderId: 'abcdefghijklmnopqrst', mensagens: [{ de: 'eu', tipo: 'texto', texto: 'oi' }], marcas: ['humano', 'hackear'],
    });
    expect(rpc).toHaveBeenCalledWith('suporte_registrar', expect.objectContaining({
      p_id: ID, p_order_id: 'abcdefghijklmnopqrst', p_phone: '94991234567', p_nome: 'Maria', p_marcas: ['humano'],
    }));
  });
});
