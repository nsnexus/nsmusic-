import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { dispararSeparacaoVps, playbackTravado, resolverEndpointSeparacao } from '@/lib/playbackVps';

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

    const { segredo: vpsSecret } = resolverEndpointSeparacao(env);

    const body = await req.json().catch(() => ({}));
    const { orderId, audioId, audioUrl } = body || {};

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
    // Já tem uma separação rodando de verdade (iniciada há menos de 6 min): não dispara outra.
    // Se passou disso, a VPS perdeu o trabalho e o pedido pode ser disparado de novo.
    if (order.playbackStatus === 'GERANDO' && !playbackTravado(order)) {
      return NextResponse.json({ success: true, playbackStatus: 'GERANDO', alreadyRunning: true });
    }

    const faixas = Array.isArray(order.audioIds) ? order.audioIds : [];
    const arquivosFaixas = Array.isArray(order.audioFiles)
      ? order.audioFiles.map(f => typeof f === 'string' ? f : f?.url).filter(Boolean)
      : [];
    const targetAudioId = audioId || order.playbackChosenAudioId;

    let targetAudioUrl = null;
    if (audioUrl && (arquivosFaixas.includes(audioUrl) || audioUrl === order.audioUrl)) {
      targetAudioUrl = audioUrl;
    }
    if (!targetAudioUrl && targetAudioId && faixas.length > 0) {
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

    // Marca status GERANDO no Supabase e persiste a faixa escolhida
    await updateOrder(orderId, {
      playbackStatus: 'GERANDO',
      playbackError: null,
      playbackStartedAt: new Date().toISOString(),
      // Diagnóstico: se estava em GERANDO e travou, a VPS aceitou o trabalho e nunca terminou.
      ...(order.playbackStatus === 'GERANDO' ? {
        playbackFalhaMotivo: 'vps_aceitou_e_nao_terminou',
        playbackFalhaEm: new Date().toISOString(),
        playbackReenvios: (Number(order.playbackReenvios) || 0) + 1,
      } : {}),
      playbackChosenAudioId: targetAudioId || null,
      playbackChosenAudioUrl: targetAudioUrl || null,
      updatedAt: new Date().toISOString(),
    }, env).catch(err => {
      console.warn('[playback/generate] Falha ao atualizar playbackStatus para GERANDO:', err?.message);
    });

    const disparo = await dispararSeparacaoVps({ orderId, audioUrl: targetAudioUrl, env });
    if (!disparo.ok) {
      console.error(`[playback/generate] Falha ao acionar VPS (${disparo.motivo})`);
      await updateOrder(orderId, {
        playbackStatus: 'FAILED',
        playbackError: 'O servidor de áudio não respondeu. Tente novamente em instantes.',
        playbackFalhaMotivo: `disparo_${disparo.motivo}`,
        playbackFalhaEm: new Date().toISOString(),
      }, env).catch(() => {});

      return NextResponse.json({
        error: 'Não foi possível iniciar a geração do playback no momento. Tente novamente.',
      }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      playbackStatus: 'GERANDO',
      message: 'Geração do playback iniciada na VPS',
      data: disparo.dados,
    });

  } catch (err) {
    console.error('[playback/generate] Erro inesperado:', err);
    return NextResponse.json({
      error: 'Erro interno ao processar solicitação de playback.',
    }, { status: 500 });
  }
}
