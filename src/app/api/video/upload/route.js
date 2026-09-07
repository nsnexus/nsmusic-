import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// Recebe o vídeo (Blob) que o navegador do cliente já renderizou (Canvas + MediaRecorder, ver
// src/lib/videoGenerator.js) e salva no bucket R2 (binding nsmusic_media) — 07/09/2026, mesmo motivo
// do áudio (src/lib/audioArchive.js): egress zero no R2 contra ~US$0,12/GB no Firebase Storage, e
// vídeo é o maior arquivo do produto. O SDK `firebase/storage` continua sendo o fallback (usado
// direto no navegador) se esta rota falhar ou o binding não estiver disponível no ambiente — nunca
// bloqueia a entrega do vídeo por causa da migração de destino.

const MIME_ALLOWLIST = ['video/mp4', 'video/mp4;codecs=h264', 'video/webm'];
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB — bem acima do esperado (~1 Mbps * 3min ≈ 22 MB), sobra de segurança

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
  const ext = String(searchParams.get('ext') || '').trim();
  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    return NextResponse.json({ error: 'orderId inválido.' }, { status: 400 });
  }
  if (!['mp4', 'webm'].includes(ext)) {
    return NextResponse.json({ error: 'Extensão de vídeo inválida.' }, { status: 400 });
  }

  const contentType = req.headers.get('content-type') || '';
  if (!MIME_ALLOWLIST.includes(contentType)) {
    return NextResponse.json({ error: 'Tipo de arquivo não permitido.' }, { status: 400 });
  }

  const declaredLength = Number(req.headers.get('content-length') || 0);
  if (declaredLength > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'Vídeo excede o tamanho máximo permitido.' }, { status: 413 });
  }

  let buffer;
  try {
    buffer = await req.arrayBuffer();
  } catch (err) {
    console.warn('[video/upload] Falha ao ler o corpo da requisição:', err?.message);
    return NextResponse.json({ error: 'Falha ao receber o vídeo. Tente novamente.' }, { status: 400 });
  }

  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: 'Vídeo vazio.' }, { status: 400 });
  }
  if (buffer.byteLength > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: 'Vídeo excede o tamanho máximo permitido.' }, { status: 413 });
  }

  const destPath = `videos/${orderId}/video_homenagem.${ext}`;
  try {
    await r2Bucket.put(destPath, buffer, { httpMetadata: { contentType } });
  } catch (err) {
    console.warn('[video/upload] Falha ao gravar no R2:', err?.message);
    return NextResponse.json({ error: 'Falha ao salvar o vídeo. Tente novamente.' }, { status: 500 });
  }

  const url = `${r2PublicUrl.replace(/\/$/, '')}/${destPath}`;
  return NextResponse.json({ url, bytes: buffer.byteLength });
}
