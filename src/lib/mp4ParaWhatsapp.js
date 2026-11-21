// Converte o vídeo gravado no navegador num MP4 "normal", que o WhatsApp lê inteiro.
//
// Achado 17/11 e 20/11/2026: o MediaRecorder do Chrome/Android grava MP4 FRAGMENTADO (pedaços de
// ~6 s) e com áudio Opus. O player do site lê todos os pedaços e toca inteiro, mas o WhatsApp só
// lê o primeiro: o cliente via o vídeo com 6 segundos ao compartilhar.
//
// Aqui o arquivo é reorganizado (remux) com a biblioteca mediabunny: a imagem é só copiada, sem
// gravar de novo (rápido, não pesa no celular); o índice vai para o começo do arquivo (fastStart);
// e o áudio vira AAC quando o aparelho sabe codificar AAC (senão, o Opus é copiado como está).
//
// Se qualquer coisa falhar, devolve o arquivo original: melhor um vídeo que toca no site do que
// nenhum vídeo.

export async function mp4ParaWhatsapp(blob, { duracaoEsperada = 0 } = {}) {
  if (!blob || !String(blob.type || '').startsWith('video/mp4')) return blob;
  try {
    const {
      Input, Output, Conversion, BlobSource, BufferTarget, ALL_FORMATS, Mp4OutputFormat, canEncodeAudio, QUALITY_HIGH,
    } = await import('mediabunny');

    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });

    let aac = false;
    try { aac = await canEncodeAudio('aac'); } catch (e) { aac = false; }

    const conversion = await Conversion.init({
      input,
      output,
      video: { forceTranscode: false },
      audio: aac ? { codec: 'aac', quality: QUALITY_HIGH } : {},
      showWarnings: false,
    });
    if (!conversion.isValid) {
      console.warn('[mp4ParaWhatsapp] Conversão inválida, enviando o original:', conversion.discardedTracks?.map((t) => t.reason));
      return blob;
    }
    await conversion.execute();

    const convertido = new Blob([target.buffer], { type: 'video/mp4' });

    // Confere a duração do resultado: se encurtou, fica com o original.
    if (duracaoEsperada > 0) {
      try {
        const conferencia = new Input({ source: new BlobSource(convertido), formats: ALL_FORMATS });
        const dur = await conferencia.computeDuration();
        if (!(dur >= duracaoEsperada - 2)) {
          console.warn(`[mp4ParaWhatsapp] Duração ${dur}s menor que a esperada ${duracaoEsperada}s, enviando o original.`);
          return blob;
        }
      } catch (e) {
        console.warn('[mp4ParaWhatsapp] Não deu para conferir a duração:', e?.message);
      }
    }

    console.log(`[mp4ParaWhatsapp] MP4 normal gerado (${(convertido.size / 1048576).toFixed(1)} MB, áudio ${aac ? 'AAC' : 'copiado'}).`);
    return convertido;
  } catch (err) {
    console.warn('[mp4ParaWhatsapp] Falha ao converter, enviando o original:', err?.message);
    return blob;
  }
}
