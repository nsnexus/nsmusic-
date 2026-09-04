import { describe, it, expect } from 'vitest';
import { escolherModeloCarta, buildCartaPrompt } from '@/lib/carta';

describe('escolherModeloCarta', () => {
  it('ocasião de casal vira categoria romântica', () => {
    expect(escolherModeloCarta({ occasion: 'Declaração de Amor' }).categoria).toBe('romantica');
    expect(escolherModeloCarta({ occasion: 'Dia dos Namorados' }).categoria).toBe('romantica');
    expect(escolherModeloCarta({ occasion: 'Pedido de Namoro' }).categoria).toBe('romantica');
  });

  it('Aniversário vira categoria aniversario', () => {
    expect(escolherModeloCarta({ occasion: 'Aniversário' }).categoria).toBe('aniversario');
  });

  it('Homenagem e Dia das Mães viram categoria homenagem', () => {
    expect(escolherModeloCarta({ occasion: 'Homenagem' }).categoria).toBe('homenagem');
    expect(escolherModeloCarta({ occasion: 'Dia das Mães' }).categoria).toBe('homenagem');
  });

  it('ocasião desconhecida ou ausente cai em padrao', () => {
    expect(escolherModeloCarta({ occasion: 'Formatura' }).categoria).toBe('padrao');
    expect(escolherModeloCarta({}).categoria).toBe('padrao');
  });

  it('relationship/recipientType feminino e masculino são reconhecidos', () => {
    expect(escolherModeloCarta({ relationship: 'Mãe' }).genero).toBe('feminino');
    expect(escolherModeloCarta({ recipientType: 'Namorada' }).genero).toBe('feminino');
    expect(escolherModeloCarta({ relationship: 'Pai' }).genero).toBe('masculino');
    expect(escolherModeloCarta({ recipientType: 'Marido' }).genero).toBe('masculino');
  });

  it('relação ambígua (Chefe, Eu mesmo, Outro) ou ausente cai em neutro', () => {
    expect(escolherModeloCarta({ relationship: 'Chefe' }).genero).toBe('neutro');
    expect(escolherModeloCarta({ relationship: 'Eu mesmo' }).genero).toBe('neutro');
    expect(escolherModeloCarta({ relationship: 'Outro' }).genero).toBe('neutro');
    expect(escolherModeloCarta({}).genero).toBe('neutro');
  });

  it('relationship tem prioridade sobre recipientType quando os dois existem', () => {
    expect(escolherModeloCarta({ relationship: 'Pai', recipientType: 'Namorada' }).genero).toBe('masculino');
  });
});

describe('buildCartaPrompt', () => {
  it('inclui a instrução de tom da categoria escolhida', () => {
    const prompt = buildCartaPrompt({ occasion: 'Aniversário', honoreeName: 'Ana' });
    expect(prompt).toContain('Tom: carta de aniversário');
  });

  it('inclui a instrução de gênero correta', () => {
    const promptFem = buildCartaPrompt({ relationship: 'Mãe', honoreeName: 'Ana' });
    expect(promptFem).toContain('FEMININA');
    const promptMasc = buildCartaPrompt({ relationship: 'Pai', honoreeName: 'João' });
    expect(promptMasc).toContain('MASCULINA');
    const promptNeutro = buildCartaPrompt({ relationship: 'Chefe', honoreeName: 'Alguém' });
    expect(promptNeutro).toContain('Evite adjetivos');
  });

  it('sempre pede retorno só do texto puro da carta', () => {
    const prompt = buildCartaPrompt({ honoreeName: 'Ana' });
    expect(prompt).toContain('RETORNE EXCLUSIVAMENTE O TEXTO DA CARTA');
  });
});
