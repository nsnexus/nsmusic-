import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    const trackIndex = typeof body?.trackIndex === 'number' ? body.trackIndex : null;
    const audioUrl = typeof body?.audioUrl === 'string' ? body.audioUrl.trim() : null;
    const audioId = typeof body?.audioId === 'string' ? body.audioId.trim() : null;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const updates = {
      updatedAt: new Date().toISOString(),
    };
    if (audioUrl) updates.karaokeChosenAudioUrl = audioUrl;
    if (trackIndex !== null) updates.karaokeChosenTrackIndex = trackIndex;
    if (audioId) updates.karaokeChosenAudioId = audioId;

    await updateOrder(orderId, updates, env);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[karaoke/choose-track] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a faixa de karaokê escolhida' }, { status: 500 });
  }
}
