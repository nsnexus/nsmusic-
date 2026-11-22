import { desenharQuadroSlideshow } from './videoFrame.js';

// Exportação 100% local: WebCodecs codifica quadros do canvas diretamente,
// Mediabunny reúne H.264 + AAC num MP4 normal com índice no início do arquivo.
// Não é preciso tocar a música inteira enquanto os quadros são codificados.
export const VIDEO_RAPIDO_FPS = 15;
export const VIDEO_RAPIDO_MAX_BYTES = 80 * 1024 * 1024;

export function calcularQuadrosVideo(duracao, fps = VIDEO_RAPIDO_FPS) {
  if (!Number.isFinite(duracao) || duracao <= 0 || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('Duração ou FPS inválidos.');
  }
  return Math.ceil(duracao * fps);
}

/**
 * Retorna Blob MP4 ou null se o aparelho não suportar H.264 + AAC via WebCodecs
 * ou se a codificação/validação falhar; o chamador usa MediaRecorder como reserva.
 * O AudioBuffer completo é fornecido à faixa AAC, sem cortar no 360º segundo.
 */
export async function tentarVideoAcelerado({
  imagens, audioBuffer, duracao, largura = 720, altura = 1280, onProgress,
}) {
  if (typeof window === 'undefined' || typeof window.VideoEncoder === 'undefined' ||
      typeof window.AudioEncoder === 'undefined') return null;
  if (!imagens?.length || !audioBuffer || !(duracao > 0)) return null;

  let output = null;
  try {
    const media = await import('mediabunny');
    const {
      Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioBufferSource,
      Quality, canEncodeVideo, canEncodeAudio, Input, BlobSource, ALL_FORMATS,
    } = media;

    const videoQuality = new Quality({ bitrate: 900000 });
    const audioQuality = new Quality({ bitrate: 128000 });
    const [videoSupported, audioSupported] = await Promise.all([
      canEncodeVideo('avc', { width: largura, height: altura, frameRate: VIDEO_RAPIDO_FPS, quality: videoQuality }),
      canEncodeAudio('aac', {
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        quality: audioQuality,
      }),
    ]);
    if (!videoSupported || !audioSupported) {
      console.info('[VideoRapido] Codec AVC/AAC indisponível; usando gravação normal.');
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;

    output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const video = new CanvasSource(canvas, { codec: 'avc', quality: videoQuality, keyFrameInterval: 2 });
    const audio = new AudioBufferSource({ codec: 'aac', quality: audioQuality });
    output.addVideoTrack(video);
    output.addAudioTrack(audio);

    await output.start();

    // Codificar AAC primeiro, com a duração INTEGRAL do áudio original.
    // O writer aceita as faixas independentemente do avanço do relógio.
    await audio.add(audioBuffer);
    audio.close();

    const total = calcularQuadrosVideo(duracao);
    let ultimoPercentual = -1;
    for (let frame = 0; frame < total; frame++) {
      const timestamp = frame / VIDEO_RAPIDO_FPS;
      const tempoFrame = Math.min(1 / VIDEO_RAPIDO_FPS, duracao - timestamp);
      desenharQuadroSlideshow(ctx, imagens, largura, altura, duracao, timestamp);
      await video.add(timestamp, tempoFrame);

      const percentual = Math.min(94, 12 + Math.floor(((frame + 1) / total) * 82));
      if (percentual !== ultimoPercentual) {
        ultimoPercentual = percentual;
        onProgress?.(percentual);
      }

      // Deixa o navegador atualizar o progresso e responder aos toques.
      // Não adiciona espera proporcional ao tempo da música.
      if (frame > 0 && frame % 45 === 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    video.close();
    onProgress?.(95);
    await output.finalize();

    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength < 50 * 1024 ||
        buffer.byteLength > VIDEO_RAPIDO_MAX_BYTES) {
      throw new Error('MP4 acelerado com tamanho inválido.');
    }

    const blob = new Blob([buffer], { type: 'video/mp4' });
    // Confirma que o contêiner tem áudio, vídeo e a música inteira.
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const [arquivoDuracao, faixaAudio, faixaVideo] = await Promise.all([
      input.computeDuration(), input.getPrimaryAudioTrack(), input.getPrimaryVideoTrack(),
    ]);
    if (!faixaAudio || !faixaVideo || !Number.isFinite(arquivoDuracao) ||
        arquivoDuracao < duracao - 2) {
      throw new Error('MP4 acelerado incompleto ou sem faixa de áudio/vídeo.');
    }

    console.info(`[VideoRapido] MP4 H.264/AAC completo: ${arquivoDuracao.toFixed(1)}s, ${(blob.size / 1048576).toFixed(1)} MB.`);
    return blob;
  } catch (err) {
    console.warn('[VideoRapido] Modo acelerado indisponível; usando MediaRecorder:', err?.message);
    try {
      if (output && output.state !== 'finalized' && output.state !== 'canceled') {
        await output.cancel();
      }
    } catch { /* sem impedir o fallback */ }
    return null;
  }
}
