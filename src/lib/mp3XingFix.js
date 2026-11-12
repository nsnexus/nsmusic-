// Utilitário puro (Edge-compatible, sem dependência de Node Buffer) para inspecionar e reparar
// cabeçalhos Xing/Info de arquivos MP3 VBR salvos a partir de streams (ex: audiostream.kie.ai).
//
// Quando a Kie.ai entrega via stream em tempo real antes da finalização Lavf, o frame 0 traz o tag
// `Xing` com `flags = 0x0F`, mas `frames = 0` e `bytes = 0`. Players de celular, WhatsApp (ao
// recodificar "como áudio") e navegadores falham ou estimam duração errada (ex: 5 min -> 2 min).

const BITRATES_MPEG1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATES_MPEG2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES_MPEG1 = [44100, 48000, 32000, 0];
const SAMPLE_RATES_MPEG2 = [22050, 24000, 16000, 0];
const SAMPLE_RATES_MPEG25 = [11025, 12000, 8000, 0];

function readU32BE(bytes, offset) {
  return (
    ((bytes[offset] << 24) >>> 0) +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function writeU32BE(bytes, offset, value) {
  const v = value >>> 0;
  bytes[offset] = (v >>> 24) & 0xff;
  bytes[offset + 1] = (v >>> 16) & 0xff;
  bytes[offset + 2] = (v >>> 8) & 0xff;
  bytes[offset + 3] = v & 0xff;
}

function skipId3v2(bytes) {
  if (bytes.length < 10) return 0;
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return 0; // 'ID3'
  const syncSize =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f);
  const hasFooter = (bytes[5] & 0x10) !== 0;
  const end = 10 + syncSize + (hasFooter ? 10 : 0);
  return end < bytes.length ? end : 0;
}

function parseMpegFrameHeader(bytes, offset) {
  if (offset + 4 > bytes.length) return null;
  if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) return null;

  const verBits = (bytes[offset + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (bytes[offset + 1] >> 1) & 0x03; // 1=Layer III
  const brIdx = (bytes[offset + 2] >> 4) & 0x0f;
  const srIdx = (bytes[offset + 2] >> 2) & 0x03;
  const pad = (bytes[offset + 2] >> 1) & 0x01;
  const channelMode = (bytes[offset + 3] >> 6) & 0x03; // 3=mono

  if (verBits === 1 || layerBits !== 1 || brIdx === 0 || brIdx === 15 || srIdx === 3) {
    return null;
  }

  const isMpeg1 = verBits === 3;
  const bitrate = (isMpeg1 ? BITRATES_MPEG1_L3[brIdx] : BITRATES_MPEG2_L3[brIdx]) * 1000;
  const sampleRate = isMpeg1
    ? SAMPLE_RATES_MPEG1[srIdx]
    : verBits === 2
      ? SAMPLE_RATES_MPEG2[srIdx]
      : SAMPLE_RATES_MPEG25[srIdx];

  if (!bitrate || !sampleRate) return null;

  const samplesPerFrame = isMpeg1 ? 1152 : 576;
  const coeff = isMpeg1 ? 144 : 72;
  const frameLength = Math.floor((coeff * bitrate) / sampleRate) + pad;
  if (frameLength < 4 || offset + frameLength > bytes.length) return null;

  const sideInfoSize = isMpeg1 ? (channelMode === 3 ? 17 : 32) : (channelMode === 3 ? 9 : 17);
  return { frameLength, samplesPerFrame, sampleRate, sideInfoSize };
}

function findXingInFrame(bytes, frameOffset, frameLength, sideInfoSize) {
  const candidates = [frameOffset + 4 + sideInfoSize];
  const limit = Math.min(bytes.length - 12, frameOffset + frameLength - 12);

  for (const pos of candidates) {
    if (pos >= frameOffset + 4 && pos <= limit && isXingOrInfoTag(bytes, pos)) {
      return pos;
    }
  }
  for (let pos = frameOffset + 4; pos <= limit; pos++) {
    if (isXingOrInfoTag(bytes, pos)) return pos;
  }
  return -1;
}

function isXingOrInfoTag(bytes, pos) {
  const isXing = bytes[pos] === 0x58 && bytes[pos + 1] === 0x69 && bytes[pos + 2] === 0x6e && bytes[pos + 3] === 0x67;
  const isInfo = bytes[pos] === 0x49 && bytes[pos + 1] === 0x6e && bytes[pos + 2] === 0x66 && bytes[pos + 3] === 0x6f;
  return isXing || isInfo;
}

/**
 * Checagem rápida apenas no prefixo inicial (~4 KB) do MP3 para detectar cabeçalho Xing zerado
 * (`frames = 0` ou `bytes = 0`) sem precisar baixar o arquivo inteiro.
 */
export function hasBrokenXingHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  if (bytes.length < 64) return false;
  const id3End = skipId3v2(bytes);
  let p = id3End;
  let firstFrame = null;
  let firstFrameOffset = -1;
  while (p + 4 < bytes.length && p < id3End + 4096) {
    const fh = parseMpegFrameHeader(bytes, p);
    if (fh) {
      firstFrame = fh;
      firstFrameOffset = p;
      break;
    }
    p++;
  }
  if (!firstFrame) return false;
  const xingOffset = findXingInFrame(bytes, firstFrameOffset, firstFrame.frameLength, firstFrame.sideInfoSize);
  if (xingOffset === -1 || xingOffset + 12 > bytes.length) return false;
  const flags = readU32BE(bytes, xingOffset + 4);
  let cursor = xingOffset + 8;
  if ((flags & 0x01) && cursor + 4 <= bytes.length) {
    if (readU32BE(bytes, cursor) === 0) return true;
    cursor += 4;
  }
  if ((flags & 0x02) && cursor + 4 <= bytes.length) {
    if (readU32BE(bytes, cursor) === 0) return true;
  }
  return false;
}

/**
 * Inspeciona um MP3 (ArrayBuffer ou Uint8Array) e retorna metadados reais de frames e Xing.
 */
export function inspectMp3Buffer(input, { collectOffsets = false } = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  const empty = {
    validMp3: false,
    id3End: 0,
    xingOffset: -1,
    xingFlags: 0,
    xingFrames: null,
    xingBytes: null,
    actualFrames: 0,
    streamBytes: 0,
    durationSec: 0,
    xingBroken: false,
    frameOffsets: [],
  };

  if (bytes.length < 16) return empty;

  const id3End = skipId3v2(bytes);
  let p = id3End;
  let firstFrame = null;
  let firstFrameOffset = -1;

  // Encontra o primeiro frame MPEG válido (exige pelo menos 2 frames encadeados para evitar falso sync)
  while (p + 4 < bytes.length && p < id3End + 8192) {
    const fh = parseMpegFrameHeader(bytes, p);
    if (fh) {
      const next = parseMpegFrameHeader(bytes, p + fh.frameLength);
      if (next) {
        firstFrame = fh;
        firstFrameOffset = p;
        break;
      }
    }
    p++;
  }

  if (!firstFrame) return empty;

  const xingOffset = findXingInFrame(bytes, firstFrameOffset, firstFrame.frameLength, firstFrame.sideInfoSize);
  let xingFlags = 0;
  let xingFrames = null;
  let xingBytes = null;

  if (xingOffset !== -1 && xingOffset + 8 <= bytes.length) {
    xingFlags = readU32BE(bytes, xingOffset + 4);
    let cursor = xingOffset + 8;
    if ((xingFlags & 0x01) && cursor + 4 <= bytes.length) {
      xingFrames = readU32BE(bytes, cursor);
      cursor += 4;
    }
    if ((xingFlags & 0x02) && cursor + 4 <= bytes.length) {
      xingBytes = readU32BE(bytes, cursor);
    }
  }

  // Caminha por todos os frames válidos para contar duração e offsets reais
  let cur = firstFrameOffset;
  let actualFrames = 0;
  let totalSamples = 0;
  let lastFrameEnd = firstFrameOffset;
  const frameOffsets = collectOffsets ? [] : null;

  while (cur + 4 <= bytes.length) {
    const fh = parseMpegFrameHeader(bytes, cur);
    if (fh) {
      if (collectOffsets) frameOffsets.push(cur - firstFrameOffset);
      actualFrames++;
      totalSamples += fh.samplesPerFrame;
      lastFrameEnd = cur + fh.frameLength;
      cur += fh.frameLength;
      continue;
    }
    cur++;
  }

  const streamBytes = Math.max(0, lastFrameEnd - firstFrameOffset);
  const audioFrames = xingOffset !== -1 ? Math.max(0, actualFrames - 1) : actualFrames;
  const durationSec = firstFrame.sampleRate > 0
    ? Math.round(((audioFrames * firstFrame.samplesPerFrame) / firstFrame.sampleRate) * 100) / 100
    : 0;

  const xingBroken = Boolean(
    xingOffset !== -1 && (
      ((xingFlags & 0x01) && xingFrames === 0) ||
      ((xingFlags & 0x02) && xingBytes === 0)
    )
  );

  return {
    validMp3: actualFrames > 0,
    id3End,
    firstFrameOffset,
    xingOffset,
    xingFlags,
    xingFrames,
    xingBytes,
    actualFrames,
    audioFrames,
    streamBytes,
    durationSec,
    xingBroken,
    frameOffsets: frameOffsets || [],
  };
}

/**
 * Repara o cabeçalho Xing VBR quando `frames = 0` ou `bytes = 0` (comum em streams chunked da Suno/Kie),
 * preenchendo a contagem exata de frames, bytes e tabela de seek (TOC) sem recodificar o áudio.
 */
export function repairMp3XingHeader(input) {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
  const info = inspectMp3Buffer(src, { collectOffsets: true });

  if (!info.validMp3 || !info.xingBroken || info.actualFrames <= 1 || info.xingOffset === -1) {
    const outBuf = src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength);
    return { repaired: false, buffer: outBuf, info };
  }

  const patched = new Uint8Array(src);
  const flags = info.xingFlags;
  let cursor = info.xingOffset + 8;

  if ((flags & 0x01) && cursor + 4 <= patched.length) {
    writeU32BE(patched, cursor, info.audioFrames);
    cursor += 4;
  }
  if ((flags & 0x02) && cursor + 4 <= patched.length) {
    writeU32BE(patched, cursor, info.streamBytes);
    cursor += 4;
  }
  if ((flags & 0x04) && cursor + 100 <= patched.length && info.streamBytes > 0 && info.frameOffsets.length > 0) {
    for (let i = 0; i < 100; i++) {
      const fi = Math.min(info.frameOffsets.length - 1, Math.floor((i / 100) * info.frameOffsets.length));
      patched[cursor + i] = Math.min(255, Math.floor((info.frameOffsets[fi] / info.streamBytes) * 256));
    }
  }

  return {
    repaired: true,
    buffer: patched.buffer,
    info: {
      ...info,
      xingFrames: (flags & 0x01) ? info.audioFrames : info.xingFrames,
      xingBytes: (flags & 0x02) ? info.streamBytes : info.xingBytes,
      xingBroken: false,
    },
  };
}
