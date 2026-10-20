import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Gera o conteúdo do arquivo concat.txt para o FFmpeg.
 * O FFmpeg concat demuxer requer repetir o último arquivo sem diretiva duration.
 *
 * @param {string[]} imageFiles - Caminhos das imagens locais
 * @param {number} totalDuration - Duração total estimada em segundos
 * @returns {string} Conteúdo do arquivo concat
 */
export function generateConcatFileContent(imageFiles, totalDuration) {
  if (!imageFiles || imageFiles.length === 0) {
    throw new Error('Lista de imagens vazia');
  }

  const durationPerImage = Math.max(2, totalDuration / imageFiles.length);
  const lines = [];

  for (const imgPath of imageFiles) {
    // Normaliza barras para formato padrão aceito pelo FFmpeg
    const normalized = imgPath.replace(/\\/g, '/');
    lines.push(`file '${normalized}'`);
    lines.push(`duration ${durationPerImage.toFixed(2)}`);
  }

  // O último arquivo precisa ser repetido sem duração para não cortar antes do tempo
  const lastImg = imageFiles[imageFiles.length - 1].replace(/\\/g, '/');
  lines.push(`file '${lastImg}'`);

  return lines.join('\n');
}

/**
 * Monta os argumentos para o comando FFmpeg.
 */
export function buildFfmpegArgs({
  concatFilePath,
  audioFilePath,
  outputFilePath,
  width = 720,
  height = 1280
}) {
  const normConcat = concatFilePath.replace(/\\/g, '/');
  const normAudio = audioFilePath.replace(/\\/g, '/');
  const normOutput = outputFilePath.replace(/\\/g, '/');

  // Filtro que cria o visual elegante estilo Reels/Stories:
  // Fundo desfocado (preenche a tela inteira) + Foto original nítida centralizada
  const videoFilter = [
    `split=2[bg][fg]`,
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=20:5[bgblurred]`,
    `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[fgscaled]`,
    `[bgblurred][fgscaled]overlay=(W-w)/2:(H-h)/2,format=yuv420p`
  ].join(';');

  return [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', normConcat,
    '-i', normAudio,
    '-vf', videoFilter,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-r', '25',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    '-shortest',
    '-movflags', '+faststart',
    normOutput
  ];
}

/**
 * Obtém a duração do arquivo de áudio via ffprobe.
 * Fallback seguro para 180s caso ffprobe não esteja disponível.
 */
export async function getAudioDuration(audioFilePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioFilePath
    ]);

    let output = '';
    proc.stdout.on('data', (d) => { output += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0 && output.trim()) {
        const dur = parseFloat(output.trim());
        if (isFinite(dur) && dur > 0) {
          return resolve(dur);
        }
      }
      // Fallback para duração padrão caso o ffprobe falhe
      resolve(180);
    });
    proc.on('error', () => {
      resolve(180);
    });
  });
}

/**
 * Renderiza o vídeo usando FFmpeg.
 *
 * @param {Object} params
 * @param {string[]} params.imageFiles - Array de imagens
 * @param {string} params.audioFile - Caminho do MP3
 * @param {string} params.outputFilePath - Caminho do MP4 de saída
 * @param {Function} [params.onProgress] - Callback de progresso (0 a 100)
 */
export async function renderSlideshowVideo({
  imageFiles,
  audioFile,
  outputFilePath,
  onProgress = null
}) {
  const duration = await getAudioDuration(audioFile);
  const workDir = path.dirname(audioFile);
  const concatPath = path.join(workDir, 'concat.txt');

  const concatContent = generateConcatFileContent(imageFiles, duration);
  await fs.writeFile(concatPath, concatContent, 'utf8');

  const args = buildFfmpegArgs({
    concatFilePath: concatPath,
    audioFilePath: audioFile,
    outputFilePath,
  });

  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg] Iniciando renderização: ${args.join(' ')}`);
    const proc = spawn('ffmpeg', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;

      // Extrai tempo decorrido para calcular progresso percentual se possível
      const match = msg.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match && onProgress && duration > 0) {
        const hours = parseFloat(match[1]);
        const mins = parseFloat(match[2]);
        const secs = parseFloat(match[3]);
        const currentSecs = hours * 3600 + mins * 60 + secs;
        const percent = Math.min(99, Math.round((currentSecs / duration) * 100));
        onProgress(percent);
      }
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        console.log(`[FFmpeg] Renderização concluída com sucesso: ${outputFilePath}`);
        if (onProgress) onProgress(100);
        return resolve({ outputPath: outputFilePath, duration });
      }

      console.error(`[FFmpeg] Falha no processo. Código de saída: ${code}\nStderr:\n${stderr}`);
      reject(new Error(`Falha no FFmpeg (código ${code}): ${stderr.slice(-300)}`));
    });

    proc.on('error', (err) => {
      console.error('[FFmpeg] Erro ao spawnar processo:', err);
      reject(new Error(`FFmpeg não encontrado ou falhou ao executar: ${err.message}`));
    });
  });
}

/**
 * Renderiza uma prévia leve de 60 segundos com imagem estática (capa da música).
 * Otimizada especificamente para WhatsApp (baixa resolução SD, bitrate contido, tamanho < 2MB).
 *
 * @param {Object} params
 * @param {string} params.coverFile - Caminho do arquivo da capa
 * @param {string} params.audioFile - Caminho do áudio MP3
 * @param {string} params.outputFilePath - Caminho do arquivo MP4 de saída
 * @param {number} [params.duration=60] - Duração em segundos (padrão 60s)
 * @param {number} [params.width=540] - Largura SD
 * @param {number} [params.height=540] - Altura SD (quadrado padrão WhatsApp)
 * @param {Function} [params.onProgress] - Callback de progresso
 */
export async function renderPreviewVideo({
  coverFile,
  audioFile,
  outputFilePath,
  duration = 60,
  width = 540,
  height = 540,
  onProgress = null
}) {
  const normCover = coverFile.replace(/\\/g, '/');
  const normAudio = audioFile.replace(/\\/g, '/');
  const normOutput = outputFilePath.replace(/\\/g, '/');

  // Filtro leve SD: escala e centraliza imagem sem distorção em 540x540
  const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`;

  const args = [
    '-y',
    '-loop', '1',
    '-i', normCover,
    '-i', normAudio,
    '-t', String(duration),
    '-vf', videoFilter,
    '-af', `afade=t=out:st=${Math.max(0, duration - 2)}:d=2`,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-r', '15',
    '-c:a', 'aac',
    '-b:a', '96k',
    '-ar', '44100',
    '-shortest',
    '-movflags', '+faststart',
    normOutput
  ];

  return new Promise((resolve, reject) => {
    console.log(`[FFmpeg-Preview] Iniciando renderização leve (60s SD): ${args.join(' ')}`);
    const proc = spawn('ffmpeg', args);

    let stderr = '';
    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      const match = msg.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
      if (match && onProgress) {
        const hours = parseFloat(match[1]);
        const mins = parseFloat(match[2]);
        const secs = parseFloat(match[3]);
        const currentSecs = hours * 3600 + mins * 60 + secs;
        const percent = Math.min(99, Math.round((currentSecs / duration) * 100));
        onProgress(percent);
      }
    });

    proc.on('close', async (code) => {
      if (code === 0) {
        console.log(`[FFmpeg-Preview] Prévia concluída com sucesso: ${outputFilePath}`);
        if (onProgress) onProgress(100);
        return resolve({ outputPath: outputFilePath, duration });
      }
      console.error(`[FFmpeg-Preview] Erro na renderização. Código ${code}: ${stderr.slice(-300)}`);
      reject(new Error(`Falha no FFmpeg Preview (código ${code}): ${stderr.slice(-300)}`));
    });

    proc.on('error', (err) => {
      console.error('[FFmpeg-Preview] Erro ao spawnar processo:', err);
      reject(new Error(`FFmpeg não encontrado ou falhou ao executar: ${err.message}`));
    });
  });
}
