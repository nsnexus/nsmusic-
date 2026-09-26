import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

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

  const { searchParams } = new URL(req.url);
  const folder = (searchParams.get('folder') || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '');
  const orderId = (searchParams.get('orderId') || '').replace(/[^a-zA-Z0-9_-]/g, '');

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Nenhum arquivo enviado.' }, { status: 400 });
    }

    const type = file.type || 'image/jpeg';
    if (!ALLOWED_MIME_TYPES.has(type)) {
      return NextResponse.json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Imagem excede o tamanho máximo permitido de 15 MB.' }, { status: 413 });
    }

    // Gera extensão a partir do tipo MIME
    let ext = 'jpg';
    if (type.includes('png')) ext = 'png';
    else if (type.includes('webp')) ext = 'webp';
    else if (type.includes('gif')) ext = 'gif';

    const timestamp = Date.now();
    const randomHex = Math.random().toString(36).substring(2, 8);
    const filename = `${timestamp}_${randomHex}.${ext}`;

    const destPath = orderId
      ? `${folder}/${orderId}/${filename}`
      : `${folder}/${filename}`;

    await r2Bucket.put(destPath, buffer, {
      httpMetadata: {
        contentType: type,
        cacheControl: 'public, max-age=31536000, immutable'
      }
    });

    const url = `${r2PublicUrl.replace(/\/$/, '')}/${destPath}`;
    return NextResponse.json({
      ok: true,
      url,
      path: destPath,
      bytes: buffer.byteLength
    }, { status: 200 });

  } catch (err) {
    console.error('[media/upload] Erro ao processar upload:', err.message);
    return NextResponse.json({ error: 'Falha ao processar upload de imagem.' }, { status: 500 });
  }
}
