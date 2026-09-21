// Catálogo de preços — fonte única de verdade sobre valores cobrados (ver C-05 no AUDIT_REPORT.md).
// Nenhuma rota de pagamento deve aceitar um valor monetário vindo do corpo da requisição; o valor é
// sempre derivado daqui a partir do SKU.
//
// SKUs usados hoje pelo frontend (criar/page.jsx e entrega/page.jsx, estado `selectedPackage`):
//   - audio_only: só a música (pacote promocional com 2 versões)
//   - combo: música + vídeo, comprados juntos
//   - video_addon: só o add-on de vídeo, para quem já pagou a música separadamente

// Preços dos add-ons definidos pelo dono do estúdio em 03/09/2026: carta 3,99 e retrospectiva 9,99.
// O vídeo foi mantido em 6,90 de propósito — subir pra 6,99 obrigaria a mexer no `combo`
// (9,99 + vídeo), que é o funil principal: sem isso a tela do wizard somaria um valor e a cobrança
// sairia outro.
export const SKU_PRICES = {
  audio_only: 9.99,
  combo: 16.89,
  video_addon: 6.90,
  playback_addon: 4.99,
  carta_addon: 3.99,
  retrospectiva_addon: 9.99,
  // Combos música+carta e música+retrospectiva (pop-up de extras dinâmico, pedido 04/09/2026) —
  // mesma regra do `combo` (música+vídeo): soma simples dos dois preços, sem desconto.
  combo_carta: 13.98,
  combo_retrospectiva: 19.98,
  recovery_combo_24h: 9.99,
  recovery_combo_48h: 6.99,
};

export function getPriceForSku(sku) {
  const price = SKU_PRICES[sku];
  return typeof price === 'number' ? price : null;
}

// Um SKU "inclui vídeo" quando concede acesso ao add-on de vídeo (ver A-13 no AUDIT_REPORT.md —
// antes disso era decidido por uma heurística de valor, frágil a qualquer cobrança futura de 6.90).
export function skuGrantsVideoAccess(sku) {
  return sku === 'combo' || sku === 'video_addon' || sku === 'recovery_combo_24h' || sku === 'recovery_combo_48h';
}

// Mesma ideia de skuGrantsVideoAccess, para os combos música+carta e música+retrospectiva.
export function skuGrantsCartaAccess(sku) {
  return sku === 'combo_carta';
}

export function skuGrantsRetrospectivaAccess(sku) {
  return sku === 'combo_retrospectiva';
}

// Um SKU "aprova a música" quando confirma o pagamento principal (paymentStatus). O video_addon
// isolado NUNCA deve alterar paymentStatus (ver C-09 no AUDIT_REPORT.md).
//
// 'impacto' é o único SKU com preço VARIÁVEL (ver /api/payments/create e /pagar) — "pague conforme
// o impacto emocional", nunca abaixo do preço da música (piso validado no servidor, nunca aceito
// do corpo da requisição). Aprova a música como qualquer pagamento do produto principal; o vídeo é
// concedido à parte, por FAIXA de valor pago (ver src/lib/payments.js), não por este SKU sozinho.
export function skuApprovesMusic(sku) {
  return sku === 'audio_only' || sku === 'combo' || sku === 'combo_carta' || sku === 'combo_retrospectiva'
    || sku === 'recovery_combo_24h' || sku === 'recovery_combo_48h' || sku === 'impacto';
}

// Escada de brindes do pagamento por impacto ("pague o quanto quiser", SKU 'impacto').
//
// Pedido do dono do estúdio em 21/09/2026, depois de liberarmos a música inteira antes do
// pagamento: o cliente decide o valor no auge da emoção, então cada faixa acima do mínimo entrega
// um extra a mais. Cumulativa — quem paga a faixa da Retrospectiva leva Carta e Vídeo junto.
//
// Os limiares SÃO os preços dos combos que já existem no catálogo, de propósito: nenhum número
// novo entra no sistema, e a escada bate exatamente com o que os combos cobram no fluxo normal.
//
// O Playback fica FORA da escada por decisão de produto: é um add-on avulso, comprado depois.
//
// Quem chama isto é o servidor, com o valor REALMENTE confirmado pela Efí — nunca com o valor que
// o cliente pediu (ver src/lib/payments.js e C-05 no AUDIT_REPORT.md).
export function brindesPorValorPago(valorPago) {
  const valor = Number(valorPago);
  const vazio = { carta: false, video: false, retrospectiva: false };
  if (!Number.isFinite(valor)) return vazio;

  // Mesma tolerância monetária usada em todo o projeto: nunca `===`, sempre margem de 1 centavo
  // (payments.md). Sem ela, R$ 13,979999 por arredondamento de float perderia o brinde.
  const alcanca = (sku) => {
    const limiar = getPriceForSku(sku);
    return limiar !== null && valor >= limiar - 0.01;
  };

  const retrospectiva = alcanca('combo_retrospectiva');
  const video = retrospectiva || alcanca('combo');
  const carta = retrospectiva || video || alcanca('combo_carta');

  return { carta, video, retrospectiva };
}

// As faixas em ordem, para a tela montar os botões sem repetir os limiares à mão.
export function faixasDeImpacto() {
  return [
    { sku: 'audio_only', valor: getPriceForSku('audio_only'), ganha: [] },
    { sku: 'combo_carta', valor: getPriceForSku('combo_carta'), ganha: ['Carta Virtual'] },
    { sku: 'combo', valor: getPriceForSku('combo'), ganha: ['Vídeo Homenagem', 'Carta Virtual'] },
    { sku: 'combo_retrospectiva', valor: getPriceForSku('combo_retrospectiva'), ganha: ['Retrospectiva', 'Vídeo Homenagem', 'Carta Virtual'] },
  ].filter((f) => f.valor !== null);
}
