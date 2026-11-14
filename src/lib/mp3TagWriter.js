/**
 * Utilitário puro em JavaScript (Edge-compatible, sem dependências nativas)
 * para embutir tags ID3v2.3 (capa do álbum/foto, título, artista, álbum, direitos autorais e letra)
 * diretamente no arquivo MP3 para download.
 */

const encoder = new TextEncoder();

/**
 * Converte um número inteiro para o formato synchsafe de 4 bytes (7 bits por byte)
 * exigido pelo cabeçalho ID3v2.
 */
function toSynchsafe(value) {
  const bytes = new Uint8Array(4);
  bytes[0] = (value >> 21) & 0x7f;
  bytes[1] = (value >> 14) & 0x7f;
  bytes[2] = (value >> 7) & 0x7f;
  bytes[3] = value & 0x7f;
  return bytes;
}

/**
 * Detecta e calcula o tamanho de um cabeçalho ID3v2 existente para pular ou substituir.
 */
export function skipId3v2(bytes) {
  if (!bytes || bytes.length < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // 'ID3'
  const syncSize =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  const end = 10 + syncSize + (hasFooter ? 10 : 0);
  return end <= bytes.length ? end : 0;
}

/**
 * Cria um frame de texto ID3v2.3 (ex: TIT2, TPE1, TALB, TCOP, TYER, TPUB).
 * Formato:
 *   - 4 bytes: ID do frame
 *   - 4 bytes: Tamanho do frame (big-endian 32-bit int)
 *   - 2 bytes: Flags (0x00, 0x00)
 *   - 1 byte: Encoding (0x03 = UTF-8)
 *   - N bytes: Texto codificado
 */
function createTextFrame(frameId, text) {
  if (!text) return null;
  const textBytes = encoder.encode(String(text));
  const frameLength = 1 + textBytes.length; // 1 byte de encoding + texto

  const frame = new Uint8Array(10 + frameLength);

  // 1. Frame ID (4 bytes)
  const idBytes = encoder.encode(frameId);
  frame.set(idBytes.subarray(0, 4), 0);

  // 2. Frame Size (4 bytes big-endian)
  frame[4] = (frameLength >> 24) & 0xff;
  frame[5] = (frameLength >> 16) & 0xff;
  frame[6] = (frameLength >> 8) & 0xff;
  frame[7] = frameLength & 0xff;

  // 3. Flags (2 bytes: 0x00, 0x00)
  frame[8] = 0x00;
  frame[9] = 0x00;

  // 4. Encoding: 0x03 (UTF-8)
  frame[10] = 0x03;

  // 5. Text data
  frame.set(textBytes, 11);

  return frame;
}

/**
 * Cria o frame de imagem de capa ID3v2.3 (APIC).
 * Formato:
 *   - 4 bytes: 'APIC'
 *   - 4 bytes: Tamanho do payload
 *   - 2 bytes: Flags
 *   - 1 byte: Encoding (0x00 para ISO-8859-1 no mime)
 *   - N bytes: MIME type null-terminated (ex: 'image/jpeg\0')
 *   - 1 byte: Picture type (0x03 = Cover Front)
 *   - 1 byte: Description null-terminated (0x00)
 *   - N bytes: Bytes brutos da imagem (JPEG/PNG)
 */
function createApicFrame(imageBytes, mimeType = 'image/jpeg') {
  if (!imageBytes || imageBytes.length === 0) return null;

  const mimeStr = (mimeType || 'image/jpeg').trim() + '\0';
  const mimeBytes = encoder.encode(mimeStr);
  const payloadLength = 1 + mimeBytes.length + 1 + 1 + imageBytes.length;

  const frame = new Uint8Array(10 + payloadLength);

  // 1. Frame ID ('APIC')
  frame.set([0x41, 0x50, 0x49, 0x43], 0);

  // 2. Frame Size
  frame[4] = (payloadLength >> 24) & 0xff;
  frame[5] = (payloadLength >> 16) & 0xff;
  frame[6] = (payloadLength >> 8) & 0xff;
  frame[7] = payloadLength & 0xff;

  // 3. Flags
  frame[8] = 0x00;
  frame[9] = 0x00;

  // 4. Text Encoding: 0x00 (ISO-8859-1)
  frame[10] = 0x00;

  // 5. MIME Type com terminador nulo
  frame.set(mimeBytes, 11);

  // 6. Picture Type: 0x03 (Capa frontal / Cover Front)
  const posPicType = 11 + mimeBytes.length;
  frame[posPicType] = 0x03;

  // 7. Description: null terminator 0x00
  frame[posPicType + 1] = 0x00;

  // 8. Raw Image Data
  frame.set(imageBytes, posPicType + 2);

  return frame;
}

/**
 * Cria o frame de letra de música (USLT - Unsynchronized Lyrics).
 */
function createLyricsFrame(lyricsText) {
  if (!lyricsText) return null;
  const lyricsBytes = encoder.encode(String(lyricsText));
  // 1 byte encoding (0x03) + 3 bytes lang ('por') + 1 byte desc terminator (0x00) + lyrics
  const payloadLength = 1 + 3 + 1 + lyricsBytes.length;

  const frame = new Uint8Array(10 + payloadLength);

  // 'USLT'
  frame.set([0x55, 0x53, 0x4c, 0x54], 0);
  frame[4] = (payloadLength >> 24) & 0xff;
  frame[5] = (payloadLength >> 16) & 0xff;
  frame[6] = (payloadLength >> 8) & 0xff;
  frame[7] = payloadLength & 0xff;
  frame[8] = 0x00;
  frame[9] = 0x00;

  frame[10] = 0x03; // UTF-8
  frame.set([0x70, 0x6f, 0x72], 11); // 'por' (Português)
  frame[14] = 0x00; // Descrição vazia terminada em nulo
  frame.set(lyricsBytes, 15);

  return frame;
}

/**
 * Embutir metadados e capa em um arquivo de áudio MP3.
 *
 * @param {ArrayBuffer|Uint8Array} mp3Input Áudio bruto do MP3
 * @param {object} tags Metadados
 * @param {string} tags.title Título da música (ex: "Canção para Maria")
 * @param {string} tags.artist Artista (ex: "NS Music Studio")
 * @param {string} tags.album Álbum (ex: "Homenagem Especial")
 * @param {string} tags.copyright Direitos autorais (ex: "© 2026 NS Music. Todos os direitos reservados.")
 * @param {string} tags.year Ano de lançamento (ex: "2026")
 * @param {string} tags.lyrics Letra da canção
 * @param {Uint8Array|ArrayBuffer} tags.imageBytes Bytes da foto de capa
 * @param {string} tags.imageMimeType Tipo MIME da imagem ('image/jpeg', 'image/png')
 * @returns {Uint8Array} MP3 completo com cabeçalho ID3v2.3 embutido
 */
export function embedId3v2Tags(mp3Input, tags = {}) {
  const mp3Bytes = mp3Input instanceof Uint8Array ? mp3Input : new Uint8Array(mp3Input);
  if (!mp3Bytes || mp3Bytes.length === 0) return mp3Bytes;

  // 1. Remove qualquer cabeçalho ID3v2 pré-existente
  const existingId3End = skipId3v2(mp3Bytes);
  const rawAudioData = existingId3End > 0 ? mp3Bytes.subarray(existingId3End) : mp3Bytes;

  // 2. Constrói os frames individuais
  const frames = [];

  // Título (TIT2)
  if (tags.title) {
    const f = createTextFrame('TIT2', tags.title);
    if (f) frames.push(f);
  }

  // Artista (TPE1)
  const artist = tags.artist || 'NS Music Studio';
  const fArtist = createTextFrame('TPE1', artist);
  if (fArtist) frames.push(fArtist);

  // Álbum (TALB)
  const album = tags.album || 'Homenagem Especial — NS Music';
  const fAlbum = createTextFrame('TALB', album);
  if (fAlbum) frames.push(fAlbum);

  // Direitos Autorais / Copyright (TCOP)
  const copyright = tags.copyright || `© ${tags.year || new Date().getFullYear()} NS Music (nsmusic.com.br). Todos os direitos reservados.`;
  const fCopyright = createTextFrame('TCOP', copyright);
  if (fCopyright) frames.push(fCopyright);

  // Ano (TYER)
  const year = String(tags.year || new Date().getFullYear());
  const fYear = createTextFrame('TYER', year);
  if (fYear) frames.push(fYear);

  // Gravadora / Editora (TPUB)
  const fPub = createTextFrame('TPUB', 'NS Music Studio');
  if (fPub) frames.push(fPub);

  // Letra (USLT)
  if (tags.lyrics) {
    const fLyrics = createLyricsFrame(tags.lyrics);
    if (fLyrics) frames.push(fLyrics);
  }

  // Capa / Imagem (APIC)
  if (tags.imageBytes) {
    const imgData = tags.imageBytes instanceof Uint8Array ? tags.imageBytes : new Uint8Array(tags.imageBytes);
    const fApic = createApicFrame(imgData, tags.imageMimeType || 'image/jpeg');
    if (fApic) frames.push(fApic);
  }

  // Se nenhum frame foi gerado, devolve o áudio original
  if (frames.length === 0) {
    return rawAudioData;
  }

  // 3. Calcula o tamanho total dos frames
  const totalFramesSize = frames.reduce((acc, f) => acc + f.length, 0);

  // 4. Constrói o cabeçalho ID3v2.3 (10 bytes)
  const id3Header = new Uint8Array(10);
  id3Header[0] = 0x49; // 'I'
  id3Header[1] = 0x44; // 'D'
  id3Header[2] = 0x33; // '3'
  id3Header[3] = 0x03; // Versão 2.3.0
  id3Header[4] = 0x00; // Revisão 0
  id3Header[5] = 0x00; // Flags

  const synchsafeSize = toSynchsafe(totalFramesSize);
  id3Header.set(synchsafeSize, 6);

  // 5. Monta o arquivo final: [Cabeçalho ID3v2] + [Frames] + [Áudio MP3]
  const finalSize = 10 + totalFramesSize + rawAudioData.length;
  const result = new Uint8Array(finalSize);

  result.set(id3Header, 0);

  let offset = 10;
  for (const frame of frames) {
    result.set(frame, offset);
    offset += frame.length;
  }

  result.set(rawAudioData, offset);

  return result;
}
