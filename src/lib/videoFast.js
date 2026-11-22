import { drawSlideshowFrame, getVideoFrameCount, VIDEO_WIDTH, VIDEO_HEIGHT, VIDEO_FPS } from './videoFrames.js';

// Processa o slideshow inteiramente no navegador, porém sem reproduzir a música em
// tempo real. MediaRecorder permanece como fallback no arquivo videoGenerator.js.
//
// Aceleração não é garantida: depende do encoder H.264/AAC disponível no aparelho.
// O arquivo final é MP4 convencional com trilhas AVC + AAC e índice no início.
export async function renderFastSlideshow({ images, audioBuffer, duration, onProgress = null }) {
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return null;
  }
  if (!Array.isArray(images) || images.length === 0 || !audioBuffer || !(duration > 0)) {
    throw new Error('Não foi possível preparar fotos ou áudio para o vídeo.');
  }

  const {
    Output, Mp4OutputFormat, BufferTarget, CanvasSource, AudioBufferSource,
    Input, BlobSource, ALL_FORMATS, Quality, canEncodeVideo, canEncodeAudio,
  } = await import('mediabunny');

  const videoQuality = new Quality({ bitrate: 900_000 });
  const audioQuality = new Quality({ bitrate: 128_000 });
  const [videoSupported, audioSupported] = await Promise.all([
    canEncodeVideo('avc', {
      width: VIDEO_WIDTH, height: VIDEO_HEIGHT, frameRate: VIDEO_FPS, quality: videoQuality,
    }),
    canEncodeAudio('aac', {
      numberOfChannels: audioBuffer.numberOfChannels,
      sampleRate: audioBuffer.sampleRate,
      quality: audioQuality,
    }),
  ]);
  if (!videoSupported || !audioSupported) return null;

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_WIDTH;
  canvas.height = VIDEO_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return null;

  const target = new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: videoQuality,
    keyFrameInterval: 2,
  });
  const audioSource = new AudioBufferSource({
    codec: 'aac',
    quality: audioQuality,
  });
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const frames = getVideoFrameCount(duration);
  let lastProgress = -1;
  try {
    await output.start();

    // O AudioBuffer já foi decodificado do MP3. Adicioná-lo diretamente
    // preserva toda a música sem depender do relógio em tempo real.
    await audioSource.add(audioBuffer);
    audioSource.close();

    for (let i = 0; i < frames; i += 1) {
      const timestamp = i / VIDEO_FPS;
      const frameDuration = Math.min(1 / VIDEO_FPS, duration - timestamp);
      drawSlideshowFrame(ctx, images, timestamp, duration);
      // Respeita o backpressure do encoder, evitando acumular milhares de
      // quadros de 720x1280 na RAM do celular.
      await videoSource.add(timestamp, frameDuration);

      const percent = 10 + Math.floor(((i + 1) / frames) * 85);
      if (percent !== lastProgress) {
        lastProgress = percent;
        if (onProgress) onProgress(Math.min(95, percent));
      }

      // Libera a thread principal para a barra de progresso e os botões.
      if (i % 12 === 11) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    videoSource.close();
    await output.finalize();

    if (!target.buffer || target.buffer.byteLength < Math.max(60_000, duration * 5_000)) {
      throw new Error('MP4 acelerado ficou incompleto.');
    }

    const blob = new Blob([target.buffer], { type: 'video/mp4' });

    // Confere separadamente as trilhas de áudio e vídeo antes de entregar.
    // Se faltar o final da música ou o vídeo estiver inválido, o fluxo de
    // MediaRecorder fará uma segunda tentativa segura com a música inteira.
    const checkInput = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const [audioTrack, videoTrack] = await Promise.all([
        checkInput.getPrimaryAudioTrack(),
        checkInput.getPrimaryVideoTrack(),
      ]);
      if (!audioTrack || !videoTrack) {
        throw new Error('O MP4 acelerado ficou sem faixa de áudio ou imagem.');
      }
      const [audioDuration, videoDuration] = await Promise.all([
        audioTrack.computeDuration(),
        videoTrack.computeDuration(),
      ]);
      if (!(audioDuration >= duration - 2) || !(videoDuration >= duration - 2)) {
        throw new Error(`MP4 acelerado ficou curto (áudio ${audioDuration.toFixed(1)}s, vídeo ${videoDuration.toFixed(1)}s, esperado ${duration.toFixed(1)}s).`);
      }
    } finally {
      checkInput.dispose();
    }

    return blob;
  } catch (err) {
    if (output.state !== 'finalized') {
      try { await output.cancel(); } catch (_) {}
    }
    throw err;
  }
}
