/**
 * Converte qualquer Blob de áudio decodificável pelo navegador (WebM, Opus, MP4, OGG)
 * para áudio PCM WAV 16-bit mono.
 * 
 * Necessário porque modelos de síntese de voz (como Suno e Kie.ai) frequentemente falham
 * ao decodificar contêineres WebM Opus gravados por navegadores móveis (Android/Chrome).
 * 
 * @param {Blob} sourceBlob
 * @returns {Promise<Blob>}
 */
export async function converterParaWavBlob(sourceBlob) {
  try {
    if (!sourceBlob) return sourceBlob;
    if (sourceBlob.type && sourceBlob.type.includes('wav')) return sourceBlob;

    const arrayBuffer = await sourceBlob.arrayBuffer();
    const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtxClass) return sourceBlob;

    const audioCtx = new AudioCtxClass();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const numChannels = 1; // Mono para consistência e tamanho reduzido
    const sampleRate = audioBuffer.sampleRate;
    const channelData = audioBuffer.getChannelData(0);
    const bytesPerSample = 2; // 16-bit PCM
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = channelData.length * bytesPerSample;

    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeStr = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true); // 16 bits per sample
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < channelData.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    try {
      audioCtx.close();
    } catch (e) {}

    return new Blob([view], { type: 'audio/wav' });
  } catch (err) {
    console.warn('[audioWav] Conversão WAV falhou, mantendo formato original:', err);
    return sourceBlob;
  }
}


/**
 * Mede a duração real da amostra antes de enviá-la à KIE, inclusive quando o
 * usuário seleciona um arquivo. Para WAV PCM, usa os metadados do arquivo;
 * para formatos de navegador usa a duração decodificada, sem fazer upload.
 * Retorna null quando o navegador não consegue ler a duração.
 */
export async function obterDuracaoAudioSegundos(blob) {
  if (!blob) return null;
  try {
    const buffer = await blob.arrayBuffer();
    if (buffer.byteLength >= 44) {
      const view = new DataView(buffer);
      const fourcc = (offset) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
      if (fourcc(0) === 'RIFF' && fourcc(8) === 'WAVE') {
        let offset = 12;
        let bytesPorSegundo = 0;
        let bytesAudio = null;
        while (offset + 8 <= buffer.byteLength) {
          const tipo = fourcc(offset);
          const size = view.getUint32(offset + 4, true);
          if (tipo === 'fmt ' && size >= 16 && offset + 24 <= buffer.byteLength) {
            bytesPorSegundo = view.getUint32(offset + 16, true);
          }
          if (tipo === 'data') {
            bytesAudio = size;
            break;
          }
          offset += 8 + size + (size % 2);
        }
        if (bytesPorSegundo > 0 && bytesAudio !== null) return bytesAudio / bytesPorSegundo;
      }
    }
    const AudioCtxClass = typeof window !== 'undefined'
      ? (window.AudioContext || window.webkitAudioContext) : null;
    if (!AudioCtxClass) return null;
    const context = new AudioCtxClass();
    try {
      const decoded = await context.decodeAudioData(buffer);
      return Number.isFinite(decoded.duration) ? decoded.duration : null;
    } finally {
      await context.close().catch(() => {});
    }
  } catch (err) {
    console.warn('[audioWav] Não foi possível medir duração:', err?.message);
    return null;
  }
}
