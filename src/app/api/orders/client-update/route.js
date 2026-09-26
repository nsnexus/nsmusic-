import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { updateOrder, getOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

// Campos que o cliente pode atualizar a partir do navegador no fluxo de entrega/criação.
// Campos sensíveis (paymentStatus, hasVideoAccess, hasCartaAccess, etc.) NUNCA são permitidos aqui.
const ALLOWED_CLIENT_FIELDS = new Set([
  'coverUrl',
  'slideshowImages',
  'videoStatus',
  'videoProgress',
  'videoUrl',
  'videoError',
  'videoCreatedAt',
  'previewListenedAt',
  'termsAccepted',
  'termsAcceptedAt',
  'lyrics',
  'lyricsVersion',
  'lyricsStatus',
  'productionStatus',
  'audioUrl',
  'audioFiles',
  'package',
  'total'
]);

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const { orderId, ...fields } = body;

    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'orderId_obrigatorio' }, { status: 400 });
    }

    // Confirma que o pedido existe
    const existing = await getOrder(orderId, env);
    if (!existing) {
      return NextResponse.json({ error: 'pedido_nao_encontrado' }, { status: 404 });
    }

    const safeUpdates = {};
    for (const [key, val] of Object.entries(fields)) {
      if (ALLOWED_CLIENT_FIELDS.has(key) && val !== undefined) {
        safeUpdates[key] = val;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      return NextResponse.json({ ok: true, updated: false });
    }

    await updateOrder(existing.id || orderId, safeUpdates, env);
    return NextResponse.json({ ok: true, updated: safeUpdates });

  } catch (err) {
    console.error('[orders/client-update] Erro:', err.message);
    return NextResponse.json({ error: 'falha_ao_atualizar' }, { status: 500 });
  }
}
