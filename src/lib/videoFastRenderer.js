import { desenharQuadroSlideshow } from './slideshowFrames.js';

const FPS = 15;
const VIDEO_BITRATE = 900_000;
const AUDIO_BITRATE = 128_000;

/**
 * Aceleração inteiramente no navegador. Não reproduz a música para gravá-la:
 * cada quadro recebe um timestamp fixo e o AudioBuffer é codificado para AAC.
 * Se H.264/AAC não forem suportados, a chamada deve voltar ao MediaRecorder.
 */
export async function suportaVideoAcelerado(audioBuffer, largura = 720, altura = 1280) {
  if (typeof window === 'undefined' || typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return false;
  }
  if (!audioBuffer || audioBuffer.duration <= 0 || audioBuffer.numberOfChannels < 1) return false;
  try {
    const { canEncodeVideo, canEncodeAudio } = await import('mediabunny');
    const [videoOk, audioOk] = await Promise.all([
      canEncodeVideo('avc', {
        width: largura,
        height: altura,
        frameRate: FPS,
        bitrate: VIDEO_BITRATE,
      }),
      canEncodeAudio('aac', {
        numberOfChannels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        bitrate: AUDIO_BITRATE,
      }),
    ]);
    return Boolean(videoOk && audioOk);
  } catch (err) {
    console.warn('[VideoFast] WebCodecs indisponível:', err?.message);
    return false;
  }
}

function verificaAudioNaoSilencioso(audioBuffer) {
  let maiorNivel = 0;
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const pcm = audioBuffer.getChannelData(channel);
    for (let i = 0; i < pcm.length; i += 1024) {
      maiorNivel = Math.max(maiorNivel, Math.abs(pcm[i]));
    }
  }
  if (maiorNivel < 0.002) {
    throw new Error('O áudio original está silencioso. Não é possível criar o vídeo com música.');
  }
}

/**
 * @returns {Promise<Blob>} MP4 H.264/AAC, com metadados no início (fast start).
 */
export async function renderizarSlideshowAcelerado({
  canvas,
  ctx,
  imagens,
  audioBuffer,
  onProgress,
}) {
  if (!canvas || !ctx || !Array.isArray(imagens) || imagens.length < 3 || !audioBuffer) {
    throw new Error('Fotos ou áudio insuficientes para a renderização acelerada.');
  }
  const duration = audioBuffer.duration;
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('Duração inválida da música.');
  verificaAudioNaoSilencioso(audioBuffer);

  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    Quality,
    Input,
    BlobSource,
    ALL_FORMATS,
  } = await import('mediabunny');

  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: 'avc',
    quality: new Quality({ bitrate: VIDEO_BITRATE }),
    keyFrameInterval: 2,
    hardwareAcceleration: 'prefer-hardware',
  });
  const audioSource = new AudioBufferSource({
    codec: 'aac',
    quality: new Quality({ bitrate: AUDIO_BITRATE }),
  });
  output.addVideoTrack(videoSource);
  output.addAudioTrack(audioSource);

  const quadroTotal = Math.ceil(duration * FPS);
  const inicio = Date.now();
  try {
    await output.start();
    // Audio e vídeo precisam alimentar o multiplexador em paralelo. A chamada
    // add() respeita backpressure, evitando criar milhares de frames em memória.
    await Promise.all([
      audioSource.add(audioBuffer),
      (async () => {
        for (let i = 0; i < quadroTotal; i += 1) {
          const instante = i / FPS;
          const duracaoQuadro = Math.min(1 / FPS, duration - instante);
          desenharQuadroSlideshow(ctx, imagens, instante, duration, canvas.width, canvas.height);
          await videoSource.add(instante, duracaoQuadro);

          if (i % 15 === 0) {
            const andamento = Math.min(95, 10 + Math.floor(((i + 1) / quadroTotal) * 85));
            onProgress?.(andamento, 'acelerado');

            // Em dispositivos que codificam mais lentamente que a reprodução,
            // não deixar tentar o modo rápido até o fim e depois perder outro
            // ciclo inteiro com o MediaRecorder.
            if (i >= 150 && Date.now() - inicio > (instante * 1000) * 1.8 + 8000) {
              throw new Error('Codificação acelerada sem ganho de velocidade neste aparelho.');
            }
          }
          // Libera o event loop para atualizar a barra no Android, sem dormir
          // o tempo real do vídeo. A codificação continua no mesmo navegador.
          if (i % 75 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      })(),
    ]);
    await output.finalize();
  } catch (err) {
    try { await output.cancel?.(); } catch {}
    throw err;
  }

  const arquivo = new Blob([output.target.buffer], { type: 'video/mp4' });
  if (arquivo.size < Math.max(50_000, duration * 5000)) {
    throw new Error('MP4 acelerado muito pequeno, possivelmente incompleto.');
  }

  // Confirma que o MP4 realmente possui vídeo, áudio e duração integral antes
  // de entregá-lo. Caso contrário, o chamador recorre à gravação tradicional.
  const conferencia = new Input({ source: new BlobSource(arquivo), formats: ALL_FORMATS });
  try {
    const [videoTrack, audioTrack] = await Promise.all([
      conferencia.getPrimaryVideoTrack(),
      conferencia.getPrimaryAudioTrack(),
    ]);
    if (!videoTrack || !audioTrack) throw new Error('MP4 sem faixa de vídeo ou áudio.');
    const duracaoAudio = await conferencia.computeDuration([audioTrack]);
    const duracaoVideo = await conferencia.computeDuration([videoTrack]);
    if (!Number.isFinite(duracaoAudio) || duracaoAudio < duration - 2 || duracaoVideo < duration - 2) {
      throw new Error('O MP4 acelerado ficou com a música ou as fotos cortadas.');
    }
  } finally {
    conferencia.dispose?.();
  }

  console.log(`[VideoFast] MP4 gerado em ${((Date.now() - inicio) / 1000).toFixed(1)}s para ${duration.toFixed(1)}s de música (${(arquivo.size / 1048576).toFixed(1)} MB).`);
  return arquivo;
}
