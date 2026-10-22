import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

/**
 * GET para redirecionar ou servir diretamente a stream pública do vídeo prévia.
 */
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get('orderId');
  if (!orderId) {
    return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
  }
  return NextResponse.redirect(new URL(`/api/video/stream/preview_${orderId}.mp4`, req.url));
}

/**
 * Rota para acionamento da renderização de vídeo prévia (60s SD leve) na VPS.
 * Utilizado para envio de mensagens automáticas de prévia com vídeo pelo WhatsApp.
 */
export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || '').trim();
    const vpsSecret = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();

    // Se a VPS ainda não estiver configurada no ambiente, retorna gracefully
    if (!vpsVideoUrl) {
      return NextResponse.json({
        success: false,
        vpsEnabled: false,
        message: 'VPS de vídeo não configurada neste ambiente.',
      }, { status: 200 });
    }

    const body = await req.json().catch(() => ({}));
    const { orderId, duration = 60, sync = false } = body || {};

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    // Seleciona a faixa de áudio e capa
    const audioUrl = order.audioUrl || order.audio_url || (Array.isArray(order.audioFiles) ? order.audioFiles[0] : '');
    const coverUrl = order.coverUrl || order.cover_url || (Array.isArray(order.slideshowImages) ? order.slideshowImages[0] : '');

    if (!audioUrl) {
      return NextResponse.json({ error: 'Nenhuma música encontrada para este pedido.' }, { status: 400 });
    }
    if (!coverUrl) {
      return NextResponse.json({ error: 'Nenhuma imagem de capa encontrada para este pedido.' }, { status: 400 });
    }

    // Normaliza URL da VPS
    let cleanBaseUrl = vpsVideoUrl.replace(/\/+$/, '');
    if (cleanBaseUrl.includes(':3100')) {
      cleanBaseUrl = cleanBaseUrl.replace(':3100', '/video');
    }
    if (cleanBaseUrl.includes('81.17.98.66')) {
      cleanBaseUrl = cleanBaseUrl.replace(/https?:\/\/81\.17\.98\.66(\/video)?/, 'https://evolution.nsnexus.com.br/video');
    }
    const targetEndpoint = cleanBaseUrl.endsWith('/render-preview')
      ? cleanBaseUrl
      : `${cleanBaseUrl}/render-preview`;

    const vpsRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vpsSecret}`,
      },
      body: JSON.stringify({
        orderId,
        coverUrl,
        audioUrl,
        duration: Math.min(Math.max(Number(duration) || 60, 15), 90),
        sync: Boolean(sync),
        title: `Prévia - ${order.customerName || order.recipientName || orderId}`,
      }),
      signal: AbortSignal.timeout(sync ? 45000 : 15000),
    });

    if (!vpsRes.ok) {
      const errText = await vpsRes.text().catch(() => '');
      console.error(`[VideoPreview] VPS respondeu status ${vpsRes.status}: ${errText}`);
      return NextResponse.json({
        success: false,
        vpsEnabled: true,
        error: `Erro ao comunicar com a VPS de vídeo (HTTP ${vpsRes.status}): ${errText.slice(0, 150)}`,
      }, { status: 502 });
    }

    const vpsData = await vpsRes.json().catch(() => ({}));

    return NextResponse.json({
      success: true,
      vpsEnabled: true,
      orderId,
      ...vpsData,
    }, { status: sync ? 200 : 202 });

  } catch (err) {
    console.error('[VideoPreview] Erro interno:', err);
    return NextResponse.json({ error: 'Erro interno ao acionar geração de prévia.' }, { status: 500 });
  }
}
