import { describe, it, expect, vi } from 'vitest';

// Chat de suporte (/suporte): regras que não podem quebrar sem ninguém ver.

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async () => null),
  updateOrder: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/ajustePago', async (orig) => ({
  ...(await orig()),
  criarCobrancaAjuste: vi.fn(async () => ({ ok: true, txid: 'A'.repeat(30), pixCopiaECola: '000201PIX', valor: 1 })),
}));

const { orderIdValido, responderChat, saudacao, assinaturaAudio, MENU } = await import('@/lib/suporteChat');
const { criarCobrancaAjuste } = await import('@/lib/ajustePago');

const pago = { id: 'abcdefghijklmnopqrst', paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['https://x/1.mp3'], lyrics: 'letra', customerName: 'Maria Silva', honoreeName: 'João' };

describe('orderIdValido', () => {
  it('aceita só o id longo do pedido, nunca o número NS- (adivinhável)', () => {
    expect(orderIdValido('abcdefghijklmnopqrst')).toBe(true);
    expect(orderIdValido('NS-2026-1234-AB')).toBe(false);
    expect(orderIdValido('123')).toBe(false);
    expect(orderIdValido("abc' or 1=1 --xxxxxx")).toBe(false);
  });
});

describe('saudacao', () => {
  it('cumprimenta pelo primeiro nome e mostra o menu', () => {
    const msgs = saudacao(pago);
    expect(msgs[0].texto).toContain('Oi, Maria!');
    expect(msgs[1].opcoes).toEqual(MENU);
  });
});

describe('ajustes', () => {
  it('pedido não pago não gera Pix de ajuste', async () => {
    const r = await responderChat({ ...pago, paymentStatus: 'AGUARDANDO_PAGAMENTO' }, { acao: 'opcao', opcao: 'estilo:Pagode' });
    expect(criarCobrancaAjuste).not.toHaveBeenCalled();
    expect(r.mensagens[0].texto).toMatch(/aguardando o pagamento/);
  });

  it('troca de ritmo em pedido pago gera o Pix de R$ 1 e espera o pagamento', async () => {
    const r = await responderChat(pago, { acao: 'opcao', opcao: 'estilo:Pagode' });
    expect(criarCobrancaAjuste).toHaveBeenCalledWith(pago, { tipo: 'ritmo', estilo: 'Pagode' }, {});
    expect(r.mensagens.find((m) => m.tipo === 'pix')).toMatchObject({ valor: 1 });
    expect(r.aguardar).toEqual({ tipo: 'pagamento', txid: 'A'.repeat(30), kind: 'ajuste' });
  });

  it('"outro ritmo" coloca a conversa no modo ritmo', async () => {
    const r = await responderChat(pago, { acao: 'opcao', opcao: 'ritmo_outro' });
    expect(r.modo).toBe('ritmo');
  });
});

describe('assinaturaAudio', () => {
  it('muda quando o áudio muda e é vazia sem áudio', () => {
    expect(assinaturaAudio({})).toBe('');
    expect(assinaturaAudio({ audioFiles: ['a'] })).not.toBe(assinaturaAudio({ audioFiles: ['b'] }));
  });
});
