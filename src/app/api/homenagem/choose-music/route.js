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
    const audioUrl = String(body?.audioUrl || '').trim();
    const trackIndex = typeof body?.trackIndex === 'number'
      ? body.trackIndex
      : (body?.trackIndex !== undefined && body?.trackIndex !== null ? parseInt(body.trackIndex, 10) : null);

    if (!orderId || (!audioUrl && trackIndex === null)) {
      return NextResponse.json({ error: 'orderId e (audioUrl ou trackIndex) são obrigatórios' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const pago = order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO';
    if (!pago) {
      return NextResponse.json({ error: 'Este pedido ainda não está pago' }, { status: 403 });
    }

    const faixasValidas = [
      ...new Set([order.audioUrl, ...(Array.isArray(order.audioFiles) ? order.audioFiles : [])].filter(Boolean))
    ];

    let urlFinal = '';
    if (trackIndex !== null && !isNaN(trackIndex) && trackIndex >= 0 && trackIndex < faixasValidas.length) {
      urlFinal = faixasValidas[trackIndex];
    } else if (audioUrl && faixasValidas.includes(audioUrl)) {
      urlFinal = audioUrl;
    } else if (audioUrl) {
      const matching = faixasValidas.find((f) => f.includes(audioUrl) || audioUrl.includes(f));
      if (matching) {
        urlFinal = matching;
      }
    }

    if (!urlFinal && faixasValidas.length > 0) {
      urlFinal = (trackIndex !== null && faixasValidas[trackIndex]) ? faixasValidas[trackIndex] : (audioUrl || faixasValidas[0]);
    }

    if (!urlFinal) {
      return NextResponse.json({ error: 'Faixa inválida para este pedido' }, { status: 400 });
    }

    const idParaAtualizar = order.id || orderId;
    await updateOrder(idParaAtualizar, { homenagemMusicaUrl: urlFinal, updatedAt: new Date().toISOString() }, env);
    return NextResponse.json({ ok: true, homenagemMusicaUrl: urlFinal });
  } catch (error) {
    console.warn('[homenagem/choose-music] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao salvar a música escolhida' }, { status: 500 });
  }
}
