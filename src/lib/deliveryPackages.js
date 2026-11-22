import { getPriceForSku, skuGrantsVideoAccess, geracoesExtrasDoSku, GERACOES_INCLUIDAS_POR_COMPRA } from './pricing.js';

// Promessa única do produto. Toda tela que fala do que o pagamento libera usa estas frases.
// Regra de negócio: o pagamento libera as 2 versões completas já geradas e mais 2 de bônus (4 músicas).
export const PROMESSA = {
  curta: '2 músicas completas agora + 2 de bônus depois do pagamento',
  checkout: 'Todas as opções incluem as 2 músicas completas em MP3 HD e mais 2 de bônus depois do pagamento.',
  modal: 'As 2 músicas completas em MP3 HD, sem corte',
  bonus: 'Mais 2 músicas de bônus, com outra letra e outro estilo',
};

export function deliveryPackages() {
  const extrasFamilia = geracoesExtrasDoSku('combo_familia');
  const totalFamilia = GERACOES_INCLUIDAS_POR_COMPRA + extrasFamilia;
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
      label: '4 Músicas + 2 Cartas Virtuais',
      curto: 'Carta + Música',
      resumo: '2 cartas emocionantes + músicas',
      icon: '💌',
      eyebrow: 'Suas palavras',
      desc: 'Suas 4 músicas + uma carta com envelope, foto e sua assinatura para cada geração: 2 cartas.',
      hasPreview: true,
      previewType: 'carta',
      includes: ['Tudo de 4 Músicas Personalizadas', '2 cartas com envelope interativo e foto (uma por geração)', 'Selo e sua assinatura especial']
    },
    {
      sku: 'combo',
      label: '4 Músicas + 2 Vídeos',
      curto: 'Vídeo + Música',
      resumo: '2 vídeos com suas fotos + 2 cartas',
      icon: '🎬',
      eyebrow: 'Suas memórias',
      badge: 'MAIS COMPRADO',
      featured: true,
      desc: 'Pague uma vez e leve em dobro: 4 músicas + um vídeo com fotos para cada geração. E 2 cartas virtuais de brinde.',
      hasPreview: true,
      previewType: 'video',
      includes: ['4 músicas em MP3 HD', '2 vídeos com fotos (um por geração)', '2 cartas virtuais de brinde']
    },
    {
      sku: 'combo_retrospectiva',
      label: '4 Músicas + 2 Retrospectivas',
      curto: 'Retrospectiva',
      resumo: '2 retrospectivas + vídeos + cartas',
      icon: '💝',
      eyebrow: 'Cada detalhe',
      badge: 'MAIS COMPLETO',
      desc: 'O pacote completo em dobro: uma retrospectiva para cada geração (fotos, linha do tempo, contador dos dias, jogos), mais 2 vídeos e 2 cartas.',
      hasPreview: true,
      previewType: 'retrospectiva',
      includes: ['4 músicas em MP3 HD', '2 retrospectivas (uma por geração)', '2 vídeos com fotos + 2 cartas virtuais', 'Linha do tempo e contador de dias']
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
      label: `Pacote Família — ${totalFamilia} gerações`,
      curto: 'Pacote Família',
      resumo: `${totalFamilia} gerações ao todo: ${GERACOES_INCLUIDAS_POR_COMPRA} incluídas + ${extrasFamilia} extras`,
      geracoesTotal: totalFamilia,
      geracoesIncluidas: GERACOES_INCLUIDAS_POR_COMPRA,
      geracoesExtras: extrasFamilia,
      icon: '👨‍👩‍👧',
      eyebrow: 'Combo completo',
      badge: 'OFERTA ESPECIAL',
      desc: `${totalFamilia} gerações de música no total: ${GERACOES_INCLUIDAS_POR_COMPRA} incluídas no pedido + ${extrasFamilia} novas gerações para quem você quiser, com letras e estilos diferentes. Inclui carta, vídeo e retrospectiva.`,
      includes: [`${totalFamilia} gerações no total (${GERACOES_INCLUIDAS_POR_COMPRA} incluídas + ${extrasFamilia} extras)`, 'Tudo de 4 Músicas + Retrospectiva', 'Vídeo e carta personalizados']
    },
  ].map(pack => ({ ...pack, price: getPriceForSku(pack.sku) }));
}

export const formatBrl = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Selo "redes sociais" dos pacotes (21/11/2026). Status do WhatsApp, Reels e TikTok só aceitam vídeo:
// quem compra só a música não consegue postar. O selo deixa isso claro ANTES da compra.
export function seloRedes(sku) {
  if (skuGrantsVideoAccess(sku)) return { tipo: 'video', texto: '📲 Posta no Status, Reels e TikTok' };
  if (sku === 'audio_only' || sku === 'combo_carta' || sku === 'combo_voz') {
    return { tipo: 'audio', texto: '🎧 Só áudio: não dá para postar no Status/Reels' };
  }
  return null;
}

export function SeloRedesEstilo(tipo) {
  return tipo === 'video'
    ? { display: 'inline-block', marginTop: '4px', padding: '2px 8px', borderRadius: '999px', background: '#dcfce7', color: '#166534', fontSize: '0.68rem', fontWeight: 800, lineHeight: 1.35 }
    : { display: 'block', marginTop: '3px', color: '#8a8190', fontSize: '0.66rem', fontWeight: 600, lineHeight: 1.3 };
}
