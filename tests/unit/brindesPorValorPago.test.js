import { describe, it, expect } from 'vitest';
import { brindesPorValorPago, faixasDeImpacto, getPriceForSku } from '@/lib/pricing';

// Esta função decide o que o cliente LEVA a partir do quanto ele pagou. Errar para cima entrega
// produto de graça; errar para baixo é cliente que pagou e não recebeu, e vira reclamação.
// Toda comparação aqui é monetária: nunca `===`, sempre tolerância de 1 centavo (payments.md).
describe('escada de brindes por valor pago (SKU impacto)', () => {
  const MUSICA = getPriceForSku('audio_only');
  const CARTA = getPriceForSku('combo_carta');
  const VIDEO = getPriceForSku('combo');
  const RETRO = getPriceForSku('combo_retrospectiva');

  it('o mínimo leva só a música', () => {
    expect(brindesPorValorPago(MUSICA)).toEqual({ carta: false, video: false, retrospectiva: false });
  });

  it('cada faixa acumula a anterior', () => {
    expect(brindesPorValorPago(CARTA)).toEqual({ carta: true, video: false, retrospectiva: false });
    expect(brindesPorValorPago(VIDEO)).toEqual({ carta: true, video: true, retrospectiva: false });
    expect(brindesPorValorPago(RETRO)).toEqual({ carta: true, video: true, retrospectiva: true });
  });

  it('pagar acima da última faixa não tira nada', () => {
    expect(brindesPorValorPago(RETRO + 50)).toEqual({ carta: true, video: true, retrospectiva: true });
  });

  it('tolera um centavo a menos, como toda comparação monetária do projeto', () => {
    // Arredondamento de float (13.979999...) não pode custar o brinde ao cliente.
    expect(brindesPorValorPago(CARTA - 0.005).carta).toBe(true);
    // Mas dois centavos abaixo é outra faixa, não arredondamento.
    expect(brindesPorValorPago(CARTA - 0.02).carta).toBe(false);
  });

  it('valor inválido não libera nada', () => {
    for (const valor of [undefined, null, '', 'abc', NaN]) {
      expect(brindesPorValorPago(valor)).toEqual({ carta: false, video: false, retrospectiva: false });
    }
  });

  it('o Playback fica fora da escada', () => {
    // Decisão de produto: é add-on avulso, comprado depois. Se algum dia entrar, este teste falha
    // e obriga a decisão a ser explícita em vez de silenciosa.
    const brindes = brindesPorValorPago(RETRO + 100);
    expect(Object.keys(brindes).sort()).toEqual(['carta', 'retrospectiva', 'video']);
  });

  it('as faixas da tela usam os mesmos valores do catálogo, em ordem crescente', () => {
    const faixas = faixasDeImpacto();
    expect(faixas.map((f) => f.valor)).toEqual([MUSICA, CARTA, VIDEO, RETRO]);
    for (let i = 1; i < faixas.length; i += 1) {
      expect(faixas[i].valor).toBeGreaterThan(faixas[i - 1].valor);
    }
  });

  it('o que cada faixa promete na tela bate com o que o servidor libera', () => {
    // Se a tela prometer e o servidor não entregar, o cliente pagou por algo que não recebeu.
    const rotulaParaChave = { 'Carta Virtual': 'carta', 'Vídeo Homenagem': 'video', Retrospectiva: 'retrospectiva' };
    for (const faixa of faixasDeImpacto()) {
      const liberado = brindesPorValorPago(faixa.valor);
      for (const rotulo of faixa.ganha) {
        expect(liberado[rotulaParaChave[rotulo]]).toBe(true);
      }
    }
  });
});
