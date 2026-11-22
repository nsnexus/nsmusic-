/**
 * Desenha um quadro do slideshow para dois modos:
 *  - WebCodecs (gera frames com timestamps sem esperar a música tocar)
 *  - MediaRecorder (grava o canvas com áudio em tempo real)
 *
 * Centralizar aqui evita diferenças de enquadramento, ordem e fade entre os modos.
 */
export function obterEstadoQuadroSlideshow(timestamp, duration, totalImagens) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(totalImagens) || totalImagens < 1) {
    throw new Error('Duração ou fotos inválidas para montar o vídeo.');
  }
  // No último quadro, não ultrapassar a duração original do áudio.
  const tempo = Math.max(0, Math.min(Number(timestamp) || 0, Math.max(0, duration - 0.000001)));
  const tempoPorFoto = duration / totalImagens;
  const indice = Math.min(totalImagens - 1, Math.floor(tempo / tempoPorFoto));
  const tempoNaFoto = tempo - indice * tempoPorFoto;
  const progresso = Math.max(0, Math.min(1, tempoNaFoto / tempoPorFoto));
  return {
    indice, progresso,
    // Suave zoom progressivo e fade nos primeiros 0,5s de cada imagem.
    escala: 1 + progresso * 0.1,
    alpha: Math.min(1, Math.max(0, tempoNaFoto / 0.5)),
  };
}

export function desenharQuadroSlideshow(ctx, imagens, timestamp, duration, largura, altura) {
  const estado = obterEstadoQuadroSlideshow(timestamp, duration, imagens?.length || 0);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, largura, altura);

  const img = imagens[estado.indice];
  if (!img || img.naturalWidth <= 0 || img.naturalHeight <= 0) return estado;

  const proporcaoFoto = img.naturalWidth / img.naturalHeight;
  const proporcaoCanvas = largura / altura;
  let larguraFoto;
  let alturaFoto;
  if (proporcaoFoto > proporcaoCanvas) {
    larguraFoto = largura * estado.escala;
    alturaFoto = larguraFoto / proporcaoFoto;
  } else {
    alturaFoto = altura * estado.escala;
    larguraFoto = alturaFoto * proporcaoFoto;
  }
  const x = (largura - larguraFoto) / 2;
  const y = (altura - alturaFoto) / 2;

  ctx.save();
  try {
    ctx.globalAlpha = estado.alpha;
    ctx.drawImage(img, x, y, larguraFoto, alturaFoto);
  } finally {
    ctx.restore();
  }
  return estado;
}
