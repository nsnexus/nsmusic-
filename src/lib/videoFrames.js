// Mesmo enquadramento e efeitos nos dois renderizadores da NS Music:
// MediaRecorder em tempo real e WebCodecs acelerado no navegador.
export const VIDEO_WIDTH = 720;
export const VIDEO_HEIGHT = 1280;
export const VIDEO_FPS = 15;

export function drawSlideshowFrame(ctx, images, elapsed, duration, width = VIDEO_WIDTH, height = VIDEO_HEIGHT) {
  if (!ctx || !Array.isArray(images) || images.length === 0 || !(duration > 0)) {
    throw new Error('Fotos ou duração inválidas para montar o vídeo.');
  }
  const timePerImage = duration / images.length;
  const currentTime = Math.max(0, Math.min(elapsed, duration - Number.EPSILON));
  const currentIndex = Math.min(images.length - 1, Math.floor(currentTime / timePerImage));
  const image = images[currentIndex];
  const imageTime = currentTime - currentIndex * timePerImage;
  const imageProgress = imageTime / timePerImage;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, width, height);

  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    // Preserva o efeito Ken Burns e a foto inteira, sem cortes.
    const scale = 1 + imageProgress * 0.1;
    const imageAspect = image.naturalWidth / image.naturalHeight;
    const canvasAspect = width / height;
    let drawWidth;
    let drawHeight;
    if (imageAspect > canvasAspect) {
      drawWidth = width * scale;
      drawHeight = drawWidth / imageAspect;
    } else {
      drawHeight = height * scale;
      drawWidth = drawHeight * imageAspect;
    }
    const offsetX = (width - drawWidth) / 2;
    const offsetY = (height - drawHeight) / 2;

    ctx.save();
    ctx.globalAlpha = imageTime < 0.5 ? imageTime / 0.5 : 1;
    ctx.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
    ctx.restore();
  }

  return currentIndex;
}

/** Calcula todos os quadros, sem limitar a música a 360 segundos. */
export function getVideoFrameCount(duration, fps = VIDEO_FPS) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('Duração ou taxa de quadros inválida.');
  }
  return Math.ceil(duration * fps);
}
