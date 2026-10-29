import { getPriceForSku } from './pricing.js';

export function deliveryPackages() {
  return [
    {
      sku: 'audio_only',
      label: '4 Músicas Personalizadas',
      icon: '🎵',
      eyebrow: 'O essencial',
      desc: 'Estas 2 completas, sem corte + mais 2 liberadas depois do pagamento, com outra letra e outro estilo.',
      includes: ['4 músicas personalizadas (2 versões agora + 2 bônus)', 'Download em MP3 HD sem cortes', 'Página exclusiva de reprodução']
    },
    {
      sku: 'combo_carta',
      label: '4 Músicas + Carta Virtual',
      icon: '💌',
      eyebrow: 'Suas palavras',
      desc: 'Suas 4 músicas + uma carta com envelope, foto colada e sua assinatura.',
      hasPreview: true,
      previewType: 'carta',
      includes: ['Tudo de 4 Músicas Personalizadas', 'Carta com envelope interativo e foto', 'Selo e sua assinatura especial']
    },
    {
      sku: 'combo_retrospectiva',
      label: '4 Músicas + Retrospectiva',
      icon: '💝',
      eyebrow: 'Cada detalhe',
      badge: 'MAIS COMPLETO',
      featured: true,
      desc: 'Suas 4 músicas tocando numa página só de vocês: fotos, linha do tempo, contador dos dias, jogos e carta.',
      hasPreview: true,
      previewType: 'retrospectiva',
      includes: ['Tudo de 4 Músicas + Carta Virtual', 'Página exclusiva de casal/família', 'Linha do tempo interativa com fotos', 'Contador de dias e momentos marcantes']
    },
    {
      sku: 'combo',
      label: '4 Músicas + Vídeo Homenagem',
      icon: '🎬',
      eyebrow: 'Suas memórias',
      desc: 'Suas 4 músicas + vídeo slideshow emocionante com suas fotos.',
      includes: ['4 músicas em MP3 HD', 'Vídeo emocionante com 10-20 fotos', 'Edição profissional sincronizada']
    },
    {
      sku: 'combo_voz',
      label: '4 Músicas + Minha Voz',
      icon: '🎙️',
      eyebrow: 'Do seu jeito',
      desc: 'Músicas cantadas no timbre da sua própria voz.',
      includes: ['2 versões com sua voz clonada por IA', 'Treinamento vocal exclusivo']
    },
  ].map(pack => ({ ...pack, price: getPriceForSku(pack.sku) }));
}

export const formatBrl = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
