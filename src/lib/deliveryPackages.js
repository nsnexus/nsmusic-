import { getPriceForSku } from './pricing.js';

// Promessa única do produto. Toda tela que fala do que o pagamento libera usa estas frases.
// Regra de negócio: o pagamento libera as 2 versões completas já geradas e mais 2 de bônus (4 músicas).
export const PROMESSA = {
  curta: '2 músicas completas agora + 2 de bônus depois do pagamento',
  checkout: 'Todas as opções incluem as 2 músicas completas em MP3 HD e mais 2 de bônus depois do pagamento.',
  modal: 'As 2 músicas completas em MP3 HD, sem corte',
  bonus: 'Mais 2 músicas de bônus, com outra letra e outro estilo',
};

export function deliveryPackages() {
  return [
    {
      sku: 'audio_only',
      label: '4 Músicas Personalizadas',
      curto: 'Música',
      resumo: '2 versões + 2 de bônus',
      icon: '🎵',
      eyebrow: 'O essencial',
      desc: 'Estas 2 completas, sem corte + mais 2 liberadas depois do pagamento, com outra letra e outro estilo.',
      includes: ['4 músicas personalizadas (2 versões agora + 2 bônus)', 'Download em MP3 HD sem cortes', 'Página exclusiva de reprodução']
    },
    {
      sku: 'combo_carta',
      label: '4 Músicas + Carta Virtual',
      curto: 'Carta + Música',
      resumo: 'Carta emocionante + músicas',
      icon: '💌',
      eyebrow: 'Suas palavras',
      desc: 'Suas 4 músicas + uma carta com envelope, foto colada e sua assinatura.',
      hasPreview: true,
      previewType: 'carta',
      includes: ['Tudo de 4 Músicas Personalizadas', 'Carta com envelope interativo e foto', 'Selo e sua assinatura especial']
    },
    {
      sku: 'combo',
      label: '4 Músicas + Vídeo Homenagem',
      curto: 'Vídeo + Carta',
      resumo: 'Vídeo com fotos + carta',
      icon: '🎬',
      eyebrow: 'Suas memórias',
      badge: 'MAIS COMPRADO',
      featured: true,
      desc: 'Suas 4 músicas + um lindo vídeo slideshow sincronizado com suas fotos para emocionar.',
      hasPreview: true,
      previewType: 'video',
      includes: ['4 músicas em MP3 HD', 'Vídeo emocionante com fotos', 'Edição profissional sincronizada']
    },
    {
      sku: 'combo_retrospectiva',
      label: '4 Músicas + Retrospectiva',
      curto: 'Retrospectiva',
      resumo: 'Linha do tempo + vídeo + carta',
      icon: '💝',
      eyebrow: 'Cada detalhe',
      badge: 'MAIS COMPLETO',
      desc: 'Suas 4 músicas tocando numa página só de vocês: fotos, linha do tempo, contador dos dias, jogos e carta.',
      hasPreview: true,
      previewType: 'retrospectiva',
      includes: ['Tudo de 4 Músicas + Carta Virtual', 'Página exclusiva de casal/família', 'Linha do tempo interativa com fotos', 'Contador de dias e momentos marcantes']
    },
    {
      sku: 'combo_voz',
      label: '4 Músicas + Minha Voz',
      curto: 'Minha Voz',
      resumo: 'Sua própria voz na música',
      icon: '🎙️',
      eyebrow: 'Do seu jeito',
      desc: 'Suas 4 músicas, com versões cantadas no timbre da sua própria voz por IA.',
      hasPreview: true,
      previewType: 'voz',
      includes: ['4 músicas, com 2 delas cantadas na sua voz por IA', 'Treinamento vocal exclusivo']
    },
    {
      sku: 'combo_familia',
      label: 'Pacote Família',
      curto: 'Pacote Família',
      resumo: 'Tudo: música, carta, vídeo e retrospectiva',
      icon: '👨‍👩‍👧',
      eyebrow: 'Combo completo',
      badge: 'OFERTA ESPECIAL',
      desc: 'Tudo da Retrospectiva (músicas, carta, vídeo e linha do tempo) + 5 músicas extras, com novas letras e estilos, para quem você quiser.',
      includes: ['Tudo de 4 Músicas + Retrospectiva', 'Vídeo e carta personalizados', '+ 5 músicas extras (novas letras e estilos)']
    },
  ].map(pack => ({ ...pack, price: getPriceForSku(pack.sku) }));
}

export const formatBrl = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
