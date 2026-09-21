import { describe, it, expect } from 'vitest';
import { normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from '@/lib/configSite';
import { linkWhatsapp } from '@/lib/useWhatsappSuporte';

// O número de suporte passou a vir do banco, editável pelo painel. Se a normalização deixar passar
// lixo, o botão "Falar no WhatsApp" do site inteiro vira link morto — e ninguém percebe até o
// cliente sumir.
describe('número de WhatsApp do suporte', () => {
  it('aceita os formatos que um humano digita', () => {
    expect(normalizarNumeroWhatsapp('94991064043')).toBe('5594991064043');
    expect(normalizarNumeroWhatsapp('(94) 99106-4043')).toBe('5594991064043');
    expect(normalizarNumeroWhatsapp('+55 94 99106-4043')).toBe('5594991064043');
    expect(normalizarNumeroWhatsapp('5594991064043')).toBe('5594991064043');
    // Número antigo do estúdio, com 8 dígitos depois do DDD.
    expect(normalizarNumeroWhatsapp('9491081351')).toBe('559491081351');
  });

  it('recusa o que não é telefone', () => {
    expect(normalizarNumeroWhatsapp('')).toBe('');
    expect(normalizarNumeroWhatsapp(null)).toBe('');
    expect(normalizarNumeroWhatsapp('abc')).toBe('');
    expect(normalizarNumeroWhatsapp('123')).toBe('');
    expect(normalizarNumeroWhatsapp('9999999999999999')).toBe('');
  });

  it('nunca gera link sem destino', () => {
    // Valor inválido salvo por engano não pode virar "https://wa.me/?text=..." — cai no padrão.
    expect(linkWhatsapp('', 'oi')).toContain(`wa.me/${WHATSAPP_SUPORTE_PADRAO}`);
    expect(linkWhatsapp('lixo', 'oi')).toContain(`wa.me/${WHATSAPP_SUPORTE_PADRAO}`);
  });

  it('monta o link com a mensagem escapada', () => {
    const url = linkWhatsapp('94991064043', 'Olá! Pedido #123');
    expect(url).toBe('https://wa.me/5594991064043?text=Ol%C3%A1!%20Pedido%20%23123');
  });

  it('sem mensagem, devolve só o link', () => {
    expect(linkWhatsapp('94991064043')).toBe('https://wa.me/5594991064043');
  });
});
