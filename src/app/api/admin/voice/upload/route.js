import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// Formatos comuns gravados por navegadores móveis (Safari iOS, Chrome Android) e uploads de áudio
const ALLOWED_MIME_TYPES = new Set([
  'audio/webm',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/aac',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/octet-stream',
  'video/webm', // Alguns navegadores gravam áudio via MediaRecorder com MIME video/webm
  'video/mp4'
]);

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

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

    const type = file.type || 'audio/webm';
    if (!ALLOWED_MIME_TYPES.has(type) && !type.startsWith('audio/')) {
      return NextResponse.json({
        error: `Formato de áudio não suportado (${type}). Envie MP3, WAV, M4A, OGG ou WEBM.`
      }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Arquivo de áudio vazio.' }, { status: 400 });
    }

    if (buffer.byteLength > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: 'Áudio excede o tamanho máximo permitido de 25 MB.' }, { status: 413 });
    }

    // Identifica extensão
    let ext = 'webm';
    if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) ext = 'm4a';
    else if (type.includes('mpeg') || type.includes('mp3')) ext = 'mp3';
    else if (type.includes('wav')) ext = 'wav';
    else if (type.includes('ogg')) ext = 'ogg';

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}_${randomHex}.${ext}`;
    const destPath = `voice/${folder}/${filename}`;

    await r2Bucket.put(destPath, buffer, {
      httpMetadata: {
        contentType: type || 'audio/webm',
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    const publicUrl = `${r2PublicUrl.replace(/\/$/, '')}/${destPath}`;

    return NextResponse.json({
      ok: true,
      url: publicUrl,
      filename,
      size: buffer.byteLength,
      contentType: type
    });
  } catch (err) {
    console.error('[voice/upload] Falha no upload de áudio:', err.message);
    return NextResponse.json({ error: 'Erro ao processar upload do áudio.' }, { status: 500 });
  }
}
