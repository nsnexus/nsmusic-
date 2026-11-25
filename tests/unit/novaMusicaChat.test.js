import { describe, it, expect } from 'vitest';
import { CAMPOS_VAZIOS, proximaEtapa, aplicarResposta, mesclarExtraidos, pareceTelefone } from '@/lib/novaMusicaChat';

// Roteiro de música nova no chat de suporte: pergunta só o que falta, aceita texto livre onde faz
// sentido e nunca deixa a IA gravar um valor fora das opções do wizard.

const completo = {
  honoreeName: 'Ana', relationship: 'Mãe', occasion: 'Aniversário', story: 'Ela sempre fez bolo de cenoura aos domingos pra família toda.',
  musicStyle: 'Sertanejo Raiz', voiceType: 'masculina', musicMood: 'Emocionante', customerName: 'João', customerPhone: '94991234567',
};

describe('proximaEtapa', () => {
  it('começa pelo nome e termina quando tem tudo', () => {
    expect(proximaEtapa(CAMPOS_VAZIOS).etapa).toBe('honoreeName');
    expect(proximaEtapa(completo)).toBeNull();
  });

  it('pula o que já foi respondido', () => {
    expect(proximaEtapa({ ...completo, musicStyle: '' }).etapa).toBe('musicStyle');
    expect(proximaEtapa({ ...completo, customerPhone: '123' }).etapa).toBe('customerPhone');
  });

  it('história curta demais pede mais detalhe', () => {
    const p = proximaEtapa({ ...completo, story: 'é legal' });
    expect(p.etapa).toBe('story');
    expect(p.texto).toMatch(/mais um pouquinho/);
  });
});

describe('aplicarResposta', () => {
  it('opção de botão grava o id do wizard', () => {
    expect(aplicarResposta('relationship', 'nova:Pai', CAMPOS_VAZIOS).campos.relationship).toBe('Pai');
  });

  it('texto livre vale para relação ("minha sogra")', () => {
    expect(aplicarResposta('relationship', 'minha sogra', CAMPOS_VAZIOS).campos.relationship).toBe('minha sogra');
  });

  it('história é somada às partes anteriores', () => {
    const r1 = aplicarResposta('story', 'curta', CAMPOS_VAZIOS);
    expect(r1.erro).toBeTruthy();
    const r2 = aplicarResposta('story', 'ela me criou sozinha e nunca desistiu', r1.campos);
    expect(r2.erro).toBeUndefined();
    expect(r2.campos.story).toBe('curta\nela me criou sozinha e nunca desistiu');
  });

  it('"outro ritmo" pede o nome por texto', () => {
    expect(aplicarResposta('musicStyle', 'nova:__outro_ritmo', CAMPOS_VAZIOS).pedirTexto).toBeTruthy();
  });

  it('telefone inválido é recusado', () => {
    expect(aplicarResposta('customerPhone', '1234', CAMPOS_VAZIOS).erro).toBeTruthy();
    expect(aplicarResposta('customerPhone', '(94) 99123-4567', CAMPOS_VAZIOS).campos.customerPhone).toBe('94991234567');
  });
});

describe('mesclarExtraidos', () => {
  it('não sobrescreve resposta do cliente e descarta valor fora da lista', () => {
    const c = mesclarExtraidos({ ...CAMPOS_VAZIOS, honoreeName: 'Ana' }, {
      honoreeName: 'Outra', relationship: 'Mãe', musicStyle: 'Bachata Eletrônica', voiceType: 'feminina',
    });
    expect(c.honoreeName).toBe('Ana');
    expect(c.relationship).toBe('Mãe');
    expect(c.musicStyle).toBe('');
    expect(c.voiceType).toBe('feminina');
  });
});

describe('pareceTelefone', () => {
  it('separa número de WhatsApp de uma história', () => {
    expect(pareceTelefone('(94) 99123-4567')).toBe(true);
    expect(pareceTelefone('quero uma música pra minha mãe')).toBe(false);
    expect(pareceTelefone('minha mãe faz 60 anos dia 12/12/2026')).toBe(false);
  });
});
