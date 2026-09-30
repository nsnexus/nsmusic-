import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getAudioDuration } from './ffmpegRunner.js';

/**
 * Converte segundos para o formato de tempo ASS (H:MM:SS.cs).
 */
export function formatAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/**
 * Gera o conteúdo do arquivo ASS com efeito de karaokê sincronizado.
 *
 * @param {object} whisperData - Retorno do Whisper com segments e words
 * @param {string} title - Título da música
 * @returns {string} Conteúdo completo do arquivo .ass
 */
export function generateAssKaraokeFile(whisperData, title = 'Karaokê') {
  const header = `[Script Info]
Title: ${title}
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial,62,&H00FFFFFF,&H0000D7FF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,4,2.5,2,80,80,100,1
Style: Title,Arial,42,&H00E2E8F0,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,8,80,80,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:06.00,Title,,0,0,0,,🎤 ${title} (Versão Karaokê)
`;

  const segments = whisperData.segments || [];
  const words = whisperData.words || [];
  const lines = [];

  for (const seg of segments) {
    const segStart = seg.start;
    const segEnd = seg.end;
    const segWords = words.filter(w => w.start >= segStart - 0.15 && w.end <= segEnd + 0.25);

    if (segWords.length === 0) continue;

    let karaokeLine = '';
    let prevEnd = segStart;

    for (const w of segWords) {
      const gap = Math.max(0, Math.round((w.start - prevEnd) * 100));
      const duration = Math.max(6, Math.round((w.end - w.start) * 100));

      if (gap > 5) {
        karaokeLine += `{\\k${gap}} `;
      }
      karaokeLine += `{\\k${duration}}${w.word.trim()} `;
      prevEnd = w.end;
    }

    const dialogue = `Dialogue: 0,${formatAssTime(segStart)},${formatAssTime(segEnd + 0.6)},Karaoke,,0,0,0,,${karaokeLine.trim()}`;
    lines.push(dialogue);
  }

  return header + lines.join('\n') + '\n';
}

/**
 * Obtém os timestamps de palavras do áudio usando a API OpenAI Whisper.
 */
export async function alignLyricsWithWhisper(audioFilePath, lyricsPrompt = '', openAiKey = process.env.OPENAI_API_KEY) {
  if (!openAiKey) {
    throw new Error('OPENAI_API_KEY não configurada no ambiente da VPS');
  }

  const audioBuffer = await fs.readFile(audioFilePath);
  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer], { type: 'audio/mpeg' }), 'audio.mp3');
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'verbose_json');
  formData.append('timestamp_granularities[]', 'word');
  formData.append('timestamp_granularities[]', 'segment');
  formData.append('language', 'pt');
  if (lyricsPrompt) {
    formData.append('prompt', lyricsPrompt.slice(0, 300));
  }

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAiKey}`,
    },
    body: formData,
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Falha no alinhamento Whisper (${res.status}): ${errText}`);
  }

  return await res.json();
}

/**
 * Monta os argumentos para o comando FFmpeg para renderizar o Karaokê Widescreen 16:9 (1920x1080).
 */
export function buildKaraokeFfmpegArgs({
  imageFilePath,
  audioFilePath,
  assSubtitleFilePath,
  outputFilePath,
  duration
}) {
  const normImg = imageFilePath.replace(/\\/g, '/');
  const normAudio = audioFilePath.replace(/\\/g, '/');
  const normAss = assSubtitleFilePath.replace(/\\/g, '/').replace(/:/g, '\\:');
  const normOutput = outputFilePath.replace(/\\/g, '/');

  // Widescreen 16:9 (1920x1080):
  // Fundo com desfoque elegante + foto original nítida centralizada + queima de legenda .ass
  const videoFilter = [
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=25:5[bg]`,
    `[0:v]scale=800:800:force_original_aspect_ratio=decrease[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2 - 50[base]`,
    `[base]subtitles='${normAss}',format=yuv420p[v]`
  ].join(';');

  return [
    '-y',
    '-loop', '1',
    '-i', normImg,
    '-i', normAudio,
    '-filter_complex', videoFilter,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '22',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '44100',
    '-t', duration.toFixed(2),
    '-movflags', '+faststart',
    normOutput,
  ];
}

/**
 * Renderiza o vídeo Karaokê usando FFmpeg.
 */
export async function renderKaraokeVideo({
  imageFilePath,
  audioFilePath,
  assSubtitleFilePath,
  outputFilePath,
  onProgress,
}) {
  const duration = await getAudioDuration(audioFilePath).catch(() => 180);
  const args = buildKaraokeFfmpegArgs({
    imageFilePath,
    audioFilePath,
    assSubtitleFilePath,
    outputFilePath,
    duration,
  });

  return new Promise((resolve, reject) => {
    const ffmpegProc = spawn('ffmpeg', args);
    let stderrBuffer = '';

    ffmpegProc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrBuffer += text;

      // Extrai time=HH:MM:SS.ms para calcular o percentual
      const match = text.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
      if (match && onProgress && duration > 0) {
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        const currentSeconds = hours * 3600 + minutes * 60 + seconds;
        const percent = Math.min(99, Math.round((currentSeconds / duration) * 100));
        onProgress(percent);
      }
    });

    ffmpegProc.on('close', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(100);
        resolve(outputFilePath);
      } else {
        const err = new Error(`FFmpeg Karaokê falhou com código de saída ${code}`);
        err.details = stderrBuffer.slice(-2000);
        reject(err);
      }
    });

    ffmpegProc.on('error', (err) => {
      reject(new Error(`Falha ao iniciar FFmpeg: ${err.message}`));
    });
  });
}
