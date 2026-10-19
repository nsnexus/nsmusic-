import { getPriceForSku, getCreditCostForSku } from './pricing.js';

export function deliveryPackages() {
  return [
    { sku: 'audio_only', label: 'Só a música', eyebrow: 'O essencial', includes: ['2 versões completas em MP3', 'Página de presente'] },
    { sku: 'combo_carta', label: 'Música + carta', eyebrow: 'Suas palavras', includes: ['Tudo de Só a música', 'Carta virtual'] },
    { sku: 'combo', label: 'Música + vídeo', eyebrow: 'Suas memórias', includes: ['Música + carta virtual', 'Vídeo com suas fotos'] },
    { sku: 'combo_retrospectiva', label: 'Presente completo', eyebrow: 'Cada detalhe', includes: ['Música + carta + vídeo', 'Retrospectiva'] },
    { sku: 'combo_voz', label: 'Música + minha voz', eyebrow: 'Do seu jeito', includes: ['2 versões completas', 'Produto de voz personalizada'] },
  ].map(pack => ({ ...pack, price: getPriceForSku(pack.sku), credits: getCreditCostForSku(pack.sku) }));
}

export const formatBrl = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
