import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

const MIME_ALLOWLIST = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav'];
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = String(env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').trim();
  if (!r2Bucket || !r2PublicUrl) {
    return NextResponse.json({ error: 'Armazenamento R2 não configurado neste ambiente.' }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const orderId = String(searchParams.get('orderId') || '').trim();
  const type = String(searchParams.get('type') || 'playback').trim().toLowerCase();

  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return NextResponse.json({ error: 'orderId inválido.' }, { status: 400 });
  }
  if (!['playback', 'vocal'].includes(type)) {
    return NextResponse.json({ error: 'Tipo de áudio inválido (deve ser playback ou vocal).' }, { status: 400 });
  }

  const contentType = (req.headers.get('content-type') || '').split(';')[0].trim();
  if (contentType && !MIME_ALLOWLIST.includes(contentType)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 400 });
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Áudio excede o tamanho máximo permitido.' }, { status: 413 });
  }

  let buffer;
  try {
    buffer = await req.arrayBuffer();
  } catch (err) {
    console.warn('[audio/upload] Falha ao ler o corpo da requisição:', err?.message);
    return NextResponse.json({ error: 'Falha ao receber o áudio. Tente novamente.' }, { status: 400 });
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Áudio vazio.' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: 'Áudio excede o tamanho máximo permitido.' }, { status: 413 });
  }

  const filename = type === 'vocal' ? 'vocal.mp3' : 'playback.mp3';
  const destPath = `playbacks/${orderId}/${filename}`;
  try {
    await r2Bucket.put(destPath, buffer, {
      httpMetadata: {
        contentType: 'audio/mpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    console.warn('[audio/upload] Falha ao gravar no R2:', err?.message);
    return NextResponse.json({ error: 'Falha ao salvar o áudio. Tente novamente.' }, { status: 500 });
  }

  const url = `${r2PublicUrl.replace(/\/$/, '')}/${destPath}`;
  return NextResponse.json({ ok: true, url, bytes: buffer.byteLength });
}
