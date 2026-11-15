// Link público do presente (/h/<pedido>?v=<versão>) — usado pelo botão de compartilhar do SongCard
// e pelo cartão "Compartilhar presente" da página de entrega.
export function buildGiftUrl(origin, order, targetId) {
  let chosenVersion = 1;
  if (order?.homenagemMusicaUrl && Array.isArray(order?.audioFiles)) {
    const idx = order.audioFiles.indexOf(order.homenagemMusicaUrl);
    if (idx >= 0) chosenVersion = idx + 1;
  } else if (typeof order?.homenagemTrackIndex === 'number') {
    chosenVersion = order.homenagemTrackIndex + 1;
  }
  return `${origin}/h/${encodeURIComponent(targetId)}?v=${chosenVersion}`;
}

export function buildGiftMessage(order) {
  return `Preparei uma música para ${order?.honoreeName || 'você'}. Ouça aqui:`;
}
