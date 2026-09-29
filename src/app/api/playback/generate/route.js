import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

/**
 * Rota para acionamento da separação vocal (Playback Instrumental) na VPS via Demucs.
 * Retorna status GERANDO e despacha a tarefa assíncrona para a VPS.
 */
export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || '').trim();
    let vpsAudioUrl = String(env?.VPS_AUDIO_URL || process.env.VPS_AUDIO_URL || '').trim();
    if (!vpsAudioUrl) {
      if (vpsVideoUrl) {
        vpsAudioUrl = vpsVideoUrl.replace(/\/video\/?$/, '/audio');
      } else {
        vpsAudioUrl = 'https://evolution.nsnexus.com.br/audio';
      }
    }
    // Normaliza rota e IP para evitar Cloudflare Error 1003
    let cleanAudioUrl = vpsAudioUrl.replace(/\/+$/, '');
    if (cleanAudioUrl.includes('81.17.98.66')) {
      cleanAudioUrl = cleanAudioUrl.replace(/https?:\/\/81\.17\.98\.66(\/audio)?/, 'https://evolution.nsnexus.com.br/audio');
    }

    const vpsSecret = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();

    const body = await req.json().catch(() => ({}));
    const { orderId, audioId } = body || {};

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId obrigatório' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    // Valida se o cliente tem acesso ao playback
    const hasAccess = Boolean(order.hasPlaybackAccess || order.playbackAddonPaid || order.has_playback_access);
    if (!hasAccess) {
      return NextResponse.json({ error: 'Este pedido não possui acesso liberado para o playback.' }, { status: 403 });
    }

    // Se já estiver pronto, retorna imediatamente
    if (order.playbackStatus === 'READY' && order.playbackUrl) {
      return NextResponse.json({
        success: true,
        alreadyReady: true,
        playbackUrl: order.playbackUrl,
        playbackStatus: 'READY',
      });
    }

    // Determina a faixa de áudio selecionada
    const faixas = Array.isArray(order.audioIds) ? order.audioIds : [];
    const arquivosFaixas = Array.isArray(order.audioFiles) ? order.audioFiles : [];
    const targetAudioId = audioId || order.playbackChosenAudioId;

    let targetAudioUrl = null;
    if (targetAudioId && faixas.length > 0) {
      const idx = faixas.indexOf(targetAudioId);
      if (idx !== -1 && arquivosFaixas[idx]) {
        targetAudioUrl = arquivosFaixas[idx];
      }
    }

    if (!targetAudioUrl) {
      targetAudioUrl = order.audioUrl || arquivosFaixas[0] || order.secondAudioUrl || null;
    }

    if (!targetAudioUrl) {
      return NextResponse.json({ error: 'Nenhum áudio encontrado para este pedido.' }, { status: 400 });
    }

    // Se a VPS não tiver segredo configurado, avisa com erro amigável
    if (!vpsSecret) {
      return NextResponse.json({
        error: 'Chave de integração da VPS de áudio não configurada.',
      }, { status: 503 });
    }

    // Marca status GERANDO no Supabase
    await updateOrder(orderId, {
      playbackStatus: 'GERANDO',
      playbackError: null,
      updatedAt: new Date().toISOString(),
    }, env).catch(err => {
      console.warn('[playback/generate] Falha ao atualizar playbackStatus para GERANDO:', err?.message);
    });

    // Despacha requisição HTTP para a VPS
    const targetEndpoint = cleanAudioUrl.endsWith('/separate') ? cleanAudioUrl : `${cleanAudioUrl}/separate`;
    const vpsRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${vpsSecret}`,
      },
      body: JSON.stringify({
        orderId,
        audioUrl: targetAudioUrl,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!vpsRes.ok) {
      const errText = await vpsRes.text().catch(() => '');
      console.error(`[playback/generate] Falha ao acionar VPS (${vpsRes.status}): ${errText}`);
      await updateOrder(orderId, {
        playbackStatus: 'FAILED',
        playbackError: `Erro ao iniciar separação na VPS (${vpsRes.status})`,
      }, env).catch(() => {});

      return NextResponse.json({
        error: 'Não foi possível iniciar a geração do playback no momento. Tente novamente.',
      }, { status: 502 });
    }

    const vpsData = await vpsRes.json().catch(() => ({}));
    return NextResponse.json({
      success: true,
      playbackStatus: 'GERANDO',
      message: 'Geração do playback iniciada na VPS',
      data: vpsData,
    });

  } catch (err) {
    console.error('[playback/generate] Erro inesperado:', err);
    return NextResponse.json({
      error: 'Erro interno ao processar solicitação de playback.',
    }, { status: 500 });
  }
}
