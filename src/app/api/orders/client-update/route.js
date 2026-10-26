import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { updateOrder, getOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

// Campos que o cliente pode atualizar a partir do navegador no fluxo de entrega/criação.
// Campos sensíveis (paymentStatus, hasVideoAccess, audioUrl, audioFiles, total, package, etc.) NUNCA são permitidos aqui.
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
  'customerName',
  'customerPhone',
  'customerEmail',
  'honoreeName',
  'relationship',
  'recipientType',
  'occasion',
  'story',
  'importantMoments',
  'musicStyle',
  'musicMood',
  'voiceType',
  'pixRequestedAt',
  'pixGeneratedAt'
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

    // Proteção contra apropriação indevida via claim-code:
    // Se o pedido já tiver um telefone registrado, requisições de client-update não podem alterá-lo.
    if (fields.customerPhone && existing.customerPhone) {
      const cleanExisting = String(existing.customerPhone).replace(/\D/g, '');
      const cleanIncoming = String(fields.customerPhone).replace(/\D/g, '');
      if (cleanExisting && cleanIncoming && cleanExisting !== cleanIncoming) {
        return NextResponse.json({ error: 'telefone_imutavel' }, { status: 403 });
      }
    }

    const safeUpdates = {};
    for (const [key, val] of Object.entries(fields)) {
      if (ALLOWED_CLIENT_FIELDS.has(key) && val !== undefined) {
        safeUpdates[key] = val;
      }
    }

    // Cliente só pode avançar o status para LETRA_GERADA, nunca finalizar áudio ou entrega
    if (safeUpdates.productionStatus && safeUpdates.productionStatus !== 'LETRA_GERADA') {
      delete safeUpdates.productionStatus;
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
