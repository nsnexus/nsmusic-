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

// Um SKU "aprova a música" quando confirma o pagamento principal (paymentStatus). O video_addon
// isolado NUNCA deve alterar paymentStatus (ver C-09 no AUDIT_REPORT.md).
//
// 'impacto' é o único SKU com preço VARIÁVEL (ver /api/payments/create e /pagar) — "pague conforme
// o impacto emocional", nunca abaixo do preço da música (piso validado no servidor, nunca aceito
// do corpo da requisição). Aprova a música como qualquer pagamento do produto principal; o vídeo é
// concedido à parte, por FAIXA de valor pago (ver src/lib/payments.js), não por este SKU sozinho.
export function skuApprovesMusic(sku) {
  return sku === 'audio_only' || sku === 'combo' || sku === 'recovery_combo_24h' || sku === 'recovery_combo_48h' || sku === 'impacto';
}
