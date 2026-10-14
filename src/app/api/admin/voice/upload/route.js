import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// Formatos comuns gravados por navegadores móveis, WhatsApp (.opus, .ogg, .m4a), gravadores e DAWs
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/opus',
  'audio/x-opus',
  'audio/flac',
  'audio/x-flac',
  'audio/octet-stream',
  'application/ogg',
  'application/octet-stream',
  'video/webm', // Alguns navegadores gravam áudio via MediaRecorder com MIME video/webm
  'video/mp4'
]);

const ALLOWED_EXTS = new Set([
  'mp3',
  'wav',
  'ogg',
  'opus',
  'm4a',
  'aac',
  'flac',
  'webm',
  'mp4'
]);

const EXT_TO_MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  webm: 'audio/webm',
  mp4: 'audio/mp4'
};

const MAX_AUDIO_BYTES = 30 * 1024 * 1024; // 30 MB

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = String(env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').trim();

  if (!r2Bucket || !r2PublicUrl) {
    return NextResponse.json({ error: 'Cloudflare R2 não configurado neste ambiente.' }, { status: 503 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const folder = (formData.get('folder') || 'voice-samples').replace(/[^a-zA-Z0-9_-]/g, '');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Nenhum arquivo de áudio enviado.' }, { status: 400 });
    }

    const originalName = typeof file.name === 'string' ? file.name : '';
    const nameExt = originalName.includes('.') ? originalName.split('.').pop().toLowerCase().trim() : '';
    const rawType = (file.type || '').toLowerCase().trim();

    const isMimeAllowed = ALLOWED_MIME_TYPES.has(rawType) || rawType.startsWith('audio/');
    const isExtAllowed = ALLOWED_EXTS.has(nameExt);

    if (!isMimeAllowed && !isExtAllowed) {
      return NextResponse.json({
        error: `Formato de áudio não suportado (${rawType || nameExt || 'desconhecido'}). Envie MP3, WAV, M4A, AAC, OGG, OPUS (WhatsApp) ou WEBM.`
      }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Arquivo de áudio vazio.' }, { status: 400 });
    }

    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Áudio excede o tamanho máximo permitido de 30 MB.' }, { status: 413 });
    }

    // Identifica extensão segura
    let ext = 'webm';
    if (isExtAllowed) {
      ext = nameExt;
    } else if (rawType.includes('opus')) {
      ext = 'opus';
    } else if (rawType.includes('ogg')) {
      ext = 'ogg';
    } else if (rawType.includes('mp4') || rawType.includes('m4a') || rawType.includes('aac')) {
      ext = 'm4a';
    } else if (rawType.includes('mpeg') || rawType.includes('mp3')) {
      ext = 'mp3';
    } else if (rawType.includes('wav')) {
      ext = 'wav';
    } else if (rawType.includes('flac')) {
      ext = 'flac';
    }

    const contentType = EXT_TO_MIME[ext] || rawType || 'audio/webm';

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}_${randomHex}.${ext}`;
    const destPath = `voice/${folder}/${filename}`;

    await r2Bucket.put(destPath, buffer, {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    const publicUrl = `${r2PublicUrl.replace(/\/$/, '')}/${destPath}`;

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      filename,
      size: buffer.byteLength,
      contentType
    });
  } catch (err) {
    console.error('[voice/upload] Falha no upload de áudio:', err.message);
    return NextResponse.json({ error: 'Erro ao processar upload do áudio.' }, { status: 500 });
  }
}
