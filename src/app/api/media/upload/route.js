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

const MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25 MB (suporta fotos de alta resolução de celulares modernos)

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

    let type = String(file.type || '').toLowerCase().split(';')[0].trim();
    const originalFilename = String(file.name || '').toLowerCase();

    // Normaliza tipos e fallbacks para dispositivos móveis
    if (type === 'image/pjpeg' || type === 'image/jpg') type = 'image/jpeg';
    if (type === 'image/x-png') type = 'image/png';

    // Se o MIME vier vazio ou genérico (típico de upload via Android / WhatsApp / Safari), detecta pela extensão
    if (!type || type === 'application/octet-stream' || type === 'binary/octet-stream') {
      if (originalFilename.endsWith('.png')) type = 'image/png';
      else if (originalFilename.endsWith('.webp')) type = 'image/webp';
      else if (originalFilename.endsWith('.gif')) type = 'image/gif';
      else if (originalFilename.endsWith('.heic')) type = 'image/heic';
      else if (originalFilename.endsWith('.heif')) type = 'image/heif';
      else type = 'image/jpeg';
    }

    if (!ALLOWED_MIME_TYPES.has(type)) {
      return NextResponse.json({ error: 'Formato de imagem não suportado. Use JPG, PNG ou WEBP.' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    if (buffer.byteLength === 0) {
      return NextResponse.json({ error: 'Arquivo vazio.' }, { status: 400 });
    }

    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Imagem excede o tamanho máximo permitido de 25 MB.' }, { status: 413 });
    }

    // Gera extensão a partir do tipo MIME ou extensão original
    let ext = 'jpg';
    if (type.includes('png') || originalFilename.endsWith('.png')) ext = 'png';
    else if (type.includes('webp') || originalFilename.endsWith('.webp')) ext = 'webp';
    else if (type.includes('gif') || originalFilename.endsWith('.gif')) ext = 'gif';
    else if (type.includes('heic') || originalFilename.endsWith('.heic')) ext = 'heic';
    else if (type.includes('heif') || originalFilename.endsWith('.heif')) ext = 'heif';

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

const ALLOWED_DELETE_PREFIXES = ['photos/', 'slideshow/', 'uploads/'];

export async function DELETE(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = String(env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').trim();
  if (!r2Bucket) {
    return NextResponse.json({ ok: false, error: 'R2 não disponível' }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const targetUrl = body?.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return NextResponse.json({ ok: false, error: 'URL inválida' }, { status: 400 });
    }

    let key = '';
    try {
      const parsed = new URL(targetUrl);
      if (r2PublicUrl) {
        const expectedHost = new URL(r2PublicUrl).host;
        if (parsed.host !== expectedHost) {
          return NextResponse.json({ ok: false, error: 'Host não autorizado' }, { status: 403 });
        }
      }
      key = parsed.pathname.replace(/^\/+/, '');
    } catch (parseErr) {
      key = String(targetUrl).replace(/^\/+/, '');
    }

    // Regra de contenção de segurança (S06):
    // Nunca permitir deletar áudios, vídeos ou qualquer chave fora das pastas de upload de fotos de clientes.
    const isAllowedPrefix = ALLOWED_DELETE_PREFIXES.some(prefix => key.startsWith(prefix));
    const isAllowedExtension = /\.(jpe?g|png|webp|gif)$/i.test(key);

    if (!isAllowedPrefix || !isAllowedExtension || key.includes('..') || key.startsWith('audios/') || key.startsWith('videos/')) {
      return NextResponse.json({ ok: false, error: 'Exclusão não permitida para este recurso' }, { status: 403 });
    }

    await r2Bucket.delete(key);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
