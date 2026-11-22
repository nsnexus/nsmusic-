/**
 * Desenha um frame do slideshow no mesmo estilo para o MediaRecorder
 * (tempo real) e o WebCodecs (renderização acelerada). A entrada t
 * está em segundos da trilha, não no relógio de parede.
 */
export function desenharQuadroSlideshow(ctx, imagens, largura, altura, duracao, t) {
  if (!ctx || !Array.isArray(imagens) || !imagens.length || !(duracao > 0)) return;

  const tempo = Math.max(0, Math.min(t, duracao));
  const tempoPorImagem = duracao / imagens.length;
  const indice = Math.min(imagens.length - 1, Math.floor(tempo / tempoPorImagem));
  const img = imagens[indice];
  const progressoDaImagem = (tempo % tempoPorImagem) / tempoPorImagem;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, largura, altura);

  if (!img || !(img.naturalWidth > 0) || !(img.naturalHeight > 0)) return;

  const escala = 1 + progressoDaImagem * 0.1;
  const razaoImagem = img.naturalWidth / img.naturalHeight;
  const razaoCanvas = largura / altura;
  let w;
  let h;
  if (razaoImagem > razaoCanvas) {
    w = largura * escala;
    h = w / razaoImagem;
  } else {
    h = altura * escala;
    w = h * razaoImagem;
  }

  ctx.save();
  const tempoNaFoto = tempo % tempoPorImagem;
  ctx.globalAlpha = tempoNaFoto < 0.5 ? tempoNaFoto / 0.5 : 1;
  ctx.drawImage(img, (largura - w) / 2, (altura - h) / 2, w, h);
  ctx.restore();
}
