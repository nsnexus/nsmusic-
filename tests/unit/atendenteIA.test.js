import { describe, it, expect, vi } from 'vitest';

// Atendente com IA do chat de suporte: a IA decide, as ferramentas fazem. Aqui a IA é simulada
// (respostas em fila) para fixar o que o sistema faz com cada decisão dela.

vi.mock('@/lib/gemini', () => ({
  runJsonCompletion: vi.fn(),
  runGeminiWithFailover: vi.fn(async () => '[Verso 1]\nAna, teu sorriso ilumina a casa inteira toda manhã de domingo\n[Refrão]\nObrigado por tudo'),
}));
vi.mock('@/lib/supabaseDb', () => ({ getOrder: vi.fn(async () => null), updateOrder: vi.fn(async () => ({})) }));

const { responderComIA, dadosDaMusicaNova } = await import('@/lib/atendenteIA');

const config = { ligado: true, texto: 'conhecimento' };
const pago = { id: 'abcdefghijklmnopqrst', customerName: 'Maria', honoreeName: 'João', paymentStatus: 'PAGO', audioFiles: ['x'], lyrics: 'l' };
const outro = { id: 'zyxwvutsrqponmlkjihg', customerName: 'Maria', honoreeName: 'Ana', paymentStatus: 'PAGO', audioFiles: ['y'] };

function iaEmFila(...saidas) {
  const fila = [...saidas];
  return vi.fn(async () => fila.shift());
}

const base = (extra = {}) => ({
  config,
  contextoDoPedido: async (p) => ({ lista: [p], grupo: [p], liberado: true }),
  findOrdersByPhone: async () => [],
  executarFerramenta: vi.fn(async (nome) => ({ mensagens: [{ tipo: 'texto', texto: `[${nome}]` }] })),
  ...extra,
});

describe('responderComIA', () => {
  it('só conversa: devolve o texto com respostas rápidas', async () => {
    const deps = base({ runJsonCompletion: iaEmFila({ resposta: 'Oi! Me conta o que você precisa.', opcoes: ['Já paguei'], ferramenta: null }) });
    const r = await responderComIA({ mensagem: 'oi' }, {}, deps);
    expect(r.mensagens[0].texto).toMatch(/Me conta/);
    expect(r.mensagens[0].opcoes[0]).toEqual({ id: 'txt:Já paguei', label: 'Já paguei' });
  });

  it('"já paguei" + WhatsApp com 1 pedido: abre o pedido e confere o pagamento no mesmo turno', async () => {
    const deps = base({
      findOrdersByPhone: async () => [pago],
      runJsonCompletion: iaEmFila(
        { resposta: '', ferramenta: { nome: 'buscar_pedidos', args: { telefone: '94991234567' } } },
        { resposta: '', ferramenta: { nome: 'conferir_pagamento', args: {} } },
      ),
    });
    const r = await responderComIA({ mensagem: 'já paguei, meu zap é 94991234567' }, {}, deps);
    expect(r.orderId).toBe(pago.id);
    expect(r.telefone).toBe('94991234567');
    expect(deps.executarFerramenta).toHaveBeenCalledWith('conferir_pagamento', {}, expect.objectContaining({ pedido: pago }), {});
  });

  it('vários pedidos no número: mostra a lista para escolher', async () => {
    const deps = base({
      findOrdersByPhone: async () => [pago, outro],
      runJsonCompletion: iaEmFila({ resposta: '', ferramenta: { nome: 'buscar_pedidos', args: { telefone: '94991234567' } } }),
    });
    const r = await responderComIA({ mensagem: '94991234567' }, {}, deps);
    expect(r.escolherPedido).toHaveLength(2);
  });

  it('não abre pedido fora da lista do número', async () => {
    const deps = base({
      runJsonCompletion: iaEmFila(
        { resposta: '', ferramenta: { nome: 'abrir_pedido', args: { pedido_id: 'pedidoDeOutraPessoa1' } } },
        { resposta: 'Me manda o WhatsApp que você usou no site?', ferramenta: null },
      ),
    });
    const r = await responderComIA({ mensagem: 'abre o pedido pedidoDeOutraPessoa1' }, {}, deps);
    expect(r.orderId).toBeUndefined();
    expect(r.mensagens[0].texto).toMatch(/WhatsApp/);
  });

  it('ferramenta de ação sem pedido aberto não roda e a IA é avisada', async () => {
    const executar = vi.fn(async () => ({ erro: 'sem_pedido_aberto' }));
    const deps = base({
      executarFerramenta: executar,
      runJsonCompletion: iaEmFila(
        { resposta: '', ferramenta: { nome: 'enviar_musicas', args: {} } },
        { resposta: 'Pra eu achar sua música, me manda o WhatsApp do pedido.', ferramenta: null },
      ),
    });
    const r = await responderComIA({ mensagem: 'cadê minha música' }, {}, deps);
    expect(r.mensagens[0].texto).toMatch(/WhatsApp/);
  });

  it('música nova: escreve a letra e devolve o rascunho para gravar', async () => {
    const deps = base({
      runJsonCompletion: iaEmFila({ resposta: 'Vou escrever!', ferramenta: { nome: 'escrever_letra_nova', args: { honoreeName: 'Ana', relationship: 'Mãe', story: 'faz bolo de cenoura todo domingo pra família', musicStyle: 'Sertanejo Raiz' } } }),
    });
    const r = await responderComIA({ mensagem: 'quero uma música pra minha mãe Ana que faz bolo todo domingo' }, {}, deps);
    expect(r.rascunho.campos).toMatchObject({ honoreeName: 'Ana', musicStyle: 'Sertanejo Raiz', voiceType: 'masculina', musicMood: 'Emocionante' });
    expect(r.mensagens.some((m) => m.tipo === 'letra')).toBe(true);
    expect(r.mensagens.at(-1).opcoes.map((o) => o.id)).toContain('nova_gravar');
  });

  it('desligado no painel ou IA fora do ar: cai no atendimento por regras', async () => {
    expect((await responderComIA({ mensagem: 'oi' }, {}, base({ config: { ligado: false, texto: '' } }))).falhou).toBe(true);
    const quebrada = vi.fn(async () => { throw new Error('timeout'); });
    expect((await responderComIA({ mensagem: 'oi' }, {}, base({ runJsonCompletion: quebrada }))).falhou).toBe(true);
  });
});

describe('dadosDaMusicaNova', () => {
  it('limpa e preenche padrões', () => {
    const d = dadosDaMusicaNova({ honoreeName: '  Ana ', voiceType: 'robô', story: 'x'.repeat(5000) });
    expect(d.honoreeName).toBe('Ana');
    expect(d.voiceType).toBe('masculina');
    expect(d.story).toHaveLength(3000);
  });
});
