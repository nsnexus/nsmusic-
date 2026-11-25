import { describe, it, expect, vi } from 'vitest';

// Chat de suporte (/suporte): regras que não podem quebrar sem ninguém ver.

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async () => null),
  updateOrder: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/lib/agentSuporte', () => ({
  classificarIntencao: vi.fn(async () => ({ intencao: 'CADE_MINHA_MUSICA', detalhe: '' })),
}));
vi.mock('@/lib/ajustePago', async (orig) => ({
  ...(await orig()),
  criarCobrancaAjuste: vi.fn(async () => ({ ok: true, txid: 'A'.repeat(30), pixCopiaECola: '000201PIX', valor: 1 })),
}));

const { orderIdValido, responderChat, saudacao, assinaturaAudio, listaDePedidos, transcricaoValida, MENU } = await import('@/lib/suporteChat');
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

describe('listaDePedidos', () => {
  it('lista os pedidos do número para o cliente escolher, com nome, data e situação', () => {
    const msg = listaDePedidos([
      { ...pago, createdAt: '2026-11-24T21:14:00.000Z' },
      { id: 'zyxwvutsrqponmlkjihg', honoreeName: 'Ana', paymentStatus: 'AGUARDANDO_PAGAMENTO', audioFiles: ['x'], createdAt: '2026-11-20T12:00:00.000Z' },
    ]);
    expect(msg.texto).toMatch(/Achei 2 pedidos/);
    expect(msg.opcoes[0]).toEqual({ id: 'pedido:abcdefghijklmnopqrst', label: 'Música de João · 24/11/2026 · paga' });
    expect(msg.opcoes[1].label).toBe('Música de Ana · 20/11/2026 · aguardando pagamento');
  });
});

describe('baixar', () => {
  it('não oferece mais envio pelo WhatsApp', async () => {
    const r = await responderChat(pago, { acao: 'opcao', opcao: 'enviar_whatsapp' });
    expect(JSON.stringify(r)).not.toMatch(/WhatsApp \(final/);
  });
});

describe('enquanto espera', () => {
  it('"cadê?" durante a gravação do ajuste responde sobre a gravação, não lista músicas antigas', async () => {
    const r = await responderChat({ ...pago, musicStyle: 'Pagode' }, { acao: 'texto', texto: 'cade pedi pra mudar o ritmo', aguardando: { tipo: 'musica', kind: 'pedido' } });
    expect(r.mensagens[0].texto).toMatch(/gravando sua nova versão em \*Pagode\*/);
    expect(r.mensagens.some((m) => m.tipo === 'audio')).toBe(false);
  });

  it('esperando o Pix do ajuste: avisa que está esperando o pagamento', async () => {
    const r = await responderChat(pago, { acao: 'texto', texto: 'e aí?', aguardando: { tipo: 'pagamento', kind: 'ajuste' } });
    expect(r.mensagens[0].texto).toMatch(/esperando o Pix de R\$ 1,00/);
  });
});

describe('transcricaoValida', () => {
  it('descarta frase fantasma do Whisper em áudio mudo', () => {
    expect(transcricaoValida('Legendas pela comunidade do Amara.org')).toBe(false);
    expect(transcricaoValida('...')).toBe(false);
    expect(transcricaoValida('quero mudar o ritmo pra pagode')).toBe(true);
  });
});
