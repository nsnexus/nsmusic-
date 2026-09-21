import { describe, it, expect } from 'vitest';
import { organizationJsonLd, serviceJsonLd, faqJsonLd, howToJsonLd } from '@/lib/structuredData';
import { getPriceForSku } from '@/lib/pricing';

// JSON-LD errado é pior que JSON-LD nenhum: um preço desatualizado aqui vira resposta errada no
// Google e no ChatGPT, e o cliente chega cobrando o valor que a máquina disse.
describe('dados estruturados (Schema.org)', () => {
  it('serializa para JSON válido', () => {
    const blocos = [organizationJsonLd(), serviceJsonLd(), faqJsonLd(), howToJsonLd()];
    expect(() => JSON.parse(JSON.stringify(blocos))).not.toThrow();
  });

  it('todo bloco declara @context e @type', () => {
    for (const bloco of [organizationJsonLd(), serviceJsonLd(), faqJsonLd(), howToJsonLd()]) {
      expect(bloco['@context']).toBe('https://schema.org');
      expect(bloco['@type']).toBeTruthy();
    }
  });

  it('os preços anunciados vêm do catálogo do servidor, não de número solto', () => {
    const ofertas = serviceJsonLd().offers;
    const porNome = (trecho) => ofertas.find((o) => o.name.includes(trecho));

    expect(porNome('Música personalizada').price).toBe(getPriceForSku('audio_only').toFixed(2));
    expect(porNome('Vídeo Homenagem (').price).toBe(getPriceForSku('video_addon').toFixed(2));
    expect(porNome('Carta Virtual').price).toBe(getPriceForSku('carta_addon').toFixed(2));
    expect(porNome('Playback').price).toBe(getPriceForSku('playback_addon').toFixed(2));

    for (const oferta of ofertas) {
      expect(oferta.priceCurrency).toBe('BRL');
      // "9.99", nunca "9,99" nem "R$ 9,99" — o Schema.org exige ponto decimal e moeda em campo
      // separado; com vírgula o Google simplesmente ignora a oferta inteira.
      expect(oferta.price).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it('o FAQ tem pergunta e resposta preenchidas em todos os itens', () => {
    const itens = faqJsonLd().mainEntity;
    expect(itens.length).toBeGreaterThanOrEqual(4);
    for (const item of itens) {
      expect(item['@type']).toBe('Question');
      expect(item.name.length).toBeGreaterThan(10);
      expect(item.acceptedAnswer.text.length).toBeGreaterThan(20);
    }
  });

  it('o HowTo descreve os três passos do funil, na ordem', () => {
    const passos = howToJsonLd().step;
    expect(passos).toHaveLength(3);
    expect(passos[0].name).toMatch(/[Cc]onte/);
    expect(passos[1].name).toMatch(/[Ll]etra/);
    expect(passos[2].name).toMatch(/[Rr]eceba/);
  });
});
