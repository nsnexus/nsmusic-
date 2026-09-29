import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

/**
 * Rota para acionamento da renderização de vídeo na VPS.
 * Se VPS_VIDEO_URL não estiver configurada, responde com vpsEnabled = false
 * sem gerar erros, preservando a retrocompatibilidade com a produção atual.
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
    const { orderId, imageUrls, selectedVideoTrack } = body || {};

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    // Valida se o pedido tem acesso ao recurso de vídeo
    const hasAccess = Boolean(order.hasVideoAccess || order.videoAddonPaid || order.has_video_access);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Este pedido não possui acesso liberado para o vídeo.' }, { status: 403 });
    }

    const cleanUrls = Array.isArray(imageUrls)
      ? imageUrls.filter(u => typeof u === 'string' && u.startsWith('http'))
      : (Array.isArray(order.slideshowImages) ? order.slideshowImages : []);

    if (cleanUrls.length < 1) {
      return NextResponse.json({ error: 'Pelo menos uma foto é necessária para gerar o vídeo.' }, { status: 400 });
    }

    // Seleciona a faixa de áudio (v1 ou v2)
    const audioUrl = (selectedVideoTrack === 'v2' && order.secondAudioUrl)
      ? order.secondAudioUrl
      : (order.audioUrl || order.audio_url || '');

    if (!audioUrl) {
      return NextResponse.json({ error: 'Nenhuma música encontrada para este pedido.' }, { status: 400 });
    }

    // Atualiza status do pedido para GERANDO no Supabase
    await updateOrder(orderId, {
      videoStatus: 'GERANDO',
      videoProgress: 10,
      slideshowImages: cleanUrls,
    }, env).catch(e => console.warn('[VideoRender] Falha ao marcar GERANDO:', e?.message));

    // Dispara chamada HTTP para a VPS (normaliza porta :3100 para rota /video na porta 80 padrão do Nginx)
    let cleanBaseUrl = vpsVideoUrl.replace(/\/+$/, '');
    if (cleanBaseUrl.includes(':3100')) {
      cleanBaseUrl = cleanBaseUrl.replace(':3100', '/video');
    }
    const targetEndpoint = cleanBaseUrl.endsWith('/render') ? cleanBaseUrl : `${cleanBaseUrl}/render`;
    const vpsRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vpsSecret}`,
      },
      body: JSON.stringify({
        orderId,
        imageUrls: cleanUrls,
        audioUrl,
        title: `Homenagem - ${order.customerName || order.recipientName || orderId}`,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!vpsRes.ok) {
      const errText = await vpsRes.text().catch(() => '');
      console.error(`[VideoRender] VPS respondeu status ${vpsRes.status}: ${errText}`);
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
      message: 'Renderização enviada para a VPS com sucesso',
      orderId,
      details: vpsData,
    }, { status: 202 });

  } catch (err) {
    console.error('[VideoRender] Erro interno:', err);
    return NextResponse.json({ error: 'Erro interno ao acionar geração de vídeo.' }, { status: 500 });
  }
}
