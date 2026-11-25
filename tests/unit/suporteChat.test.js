import { describe, it, expect, vi } from 'vitest';

// Chat de suporte (/suporte): regras que não podem quebrar sem ninguém ver.

vi.mock('@/lib/supabaseDb', () => ({
  getOrder: vi.fn(async () => null),
  updateOrder: vi.fn(async () => ({ success: true })),
}));
let pedidosDoTelefone = [];
vi.mock('@/lib/orderLookup', async (orig) => ({
  ...(await orig()),
  findOrdersByPhone: vi.fn(async () => pedidosDoTelefone),
}));
vi.mock('@/lib/agentSuporte', () => ({
  classificarIntencao: vi.fn(async () => ({ intencao: 'CADE_MINHA_MUSICA', detalhe: '' })),
}));
vi.mock('@/lib/ajustePago', async (orig) => ({
  ...(await orig()),
  criarCobrancaAjuste: vi.fn(async () => ({ ok: true, txid: 'A'.repeat(30), pixCopiaECola: '000201PIX', valor: 1 })),
}));

const { orderIdValido, responderChat, saudacao, assinaturaAudio, listaDePedidos, transcricaoValida, MENU } = await import('@/lib/suporteChat');
import { beforeEach } from 'vitest';
beforeEach(() => { pedidosDoTelefone = []; });
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
    expect(criarCobrancaAjuste).toHaveBeenCalledWith(pago, { tipo: 'ritmo', estilo: 'Pagode' }, {}, { liberado: true });
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

describe('pedido com música bônus', () => {
  const principal = { ...pago, customerPhone: '94991234567', musicStyle: 'Sertanejo', createdAt: '2026-11-24T21:14:00.000Z' };
  const bonus = { id: 'bonusbonusbonus12345', customerPhone: '94991234567', honoreeName: 'João', musicStyle: 'Pagode', isSecondGeneration: true, parentOrderId: pago.id, paymentStatus: 'PAGAMENTO_APROVADO', audioFiles: ['https://x/b.mp3'], lyrics: 'l', createdAt: '2026-11-24T22:00:00.000Z' };

  it('a lista mostra o principal com a bônus junto, não como pedido separado', () => {
    const msg = listaDePedidos([principal, bonus, { id: 'outroPedido123456789', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['y'], createdAt: '2026-11-20T12:00:00.000Z' }]);
    expect(msg.texto).toMatch(/Achei 2 pedidos/);
    expect(msg.opcoes[0].label).toMatch(/com bônus$/);
  });

  it('"Mudar o ritmo" pergunta qual das duas músicas', async () => {
    pedidosDoTelefone = [principal, bonus];
    const r = await responderChat(principal, { acao: 'opcao', opcao: 'ritmo' });
    expect(r.mensagens[0].opcoes.map((o) => o.id)).toEqual([`alvo:${pago.id}:ritmo`, 'alvo:bonusbonusbonus12345:ritmo']);
  });

  it('depois de escolher, mostra os ritmos sem perguntar de novo', async () => {
    pedidosDoTelefone = [principal, bonus];
    const r = await responderChat(bonus, { acao: 'opcao', opcao: 'ritmo', escolhido: true });
    expect(r.mensagens[0].opcoes.some((o) => o.id === 'estilo:Pagode')).toBe(true);
  });

  it('baixar entrega só as músicas desse pedido (principal + bônus)', async () => {
    pedidosDoTelefone = [principal, bonus, { id: 'outroPedido123456789', customerPhone: '94991234567', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['y'] }];
    const r = await responderChat(principal, { acao: 'opcao', opcao: 'baixar' });
    const audios = r.mensagens.filter((m) => m.tipo === 'audio').map((m) => m.url);
    expect(audios.some((u) => u.includes('outroPedido'))).toBe(false);
    expect(audios.some((u) => u.includes('bonusbonus'))).toBe(true);
  });
});

describe('início com vários pedidos no número', () => {
  const p1 = { ...pago, customerPhone: '94991234567', createdAt: '2026-11-24T21:14:00.000Z' };
  const p2 = { id: 'outroPedido123456789', customerPhone: '94991234567', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['y'], createdAt: '2026-11-20T12:00:00.000Z' };

  it('voltando pelo navegador (sem link) lista os pedidos antes', async () => {
    pedidosDoTelefone = [p1, p2];
    const r = await responderChat(p1, { acao: 'inicio', listar: true });
    expect(r.mensagens[1].texto).toMatch(/Achei 2 pedidos/);
    expect(r.escolherPedido).toHaveLength(2);
  });

  it('pelo link do pedido: saúda esse pedido e manda a lista para trocar', async () => {
    pedidosDoTelefone = [p1, p2];
    const r = await responderChat(p1, { acao: 'inicio' });
    expect(r.mensagens[0].texto).toMatch(/Já encontrei seu pedido/);
    expect(r.escolherPedido).toHaveLength(2);
  });
});

describe('foto ou vídeo', () => {
  it('manda para a página da música trocar as fotos', async () => {
    const r = await responderChat(pago, { acao: 'texto', texto: 'só quero tirar uma foto que ficou errado' });
    expect(r.mensagens.some((m) => m.tipo === 'link' && m.url.includes('/entrega?orderId='))).toBe(true);
  });
});
