import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { sendWhatsAppMessageDetailed } from '@/lib/whatsapp';
import { resolveDeliveryUrl, buildRecoveryMessage, buildVideoUpsellMessage } from '@/lib/whatsappTemplates';

export const runtime = 'edge';

const MAX_ORDERS_PER_CAMPAIGN = 100;

// Cada campanha reconfirma o critério de elegibilidade no servidor antes de enviar — a lista que o
// admin revisou no painel é só uma sugestão, nunca uma autorização; e nunca reenvia pro mesmo pedido
// (sentField), pra não repetir a mesma mensagem em campanhas futuras.
const CAMPAIGNS = {
  recovery: {
    sentField: 'recoveryMessageSentAt',
    build: buildRecoveryMessage,
    isEligible: (order) =>
      order.productionStatus === 'AUDIO_GERADO' &&
      order.paymentStatus !== 'PAGAMENTO_APROVADO' &&
      order.paymentStatus !== 'PAGO',
  },
  video_upsell: {
    sentField: 'videoUpsellMessageSentAt',
    build: buildVideoUpsellMessage,
    isEligible: (order) =>
      (order.paymentStatus === 'PAGAMENTO_APROVADO' || order.paymentStatus === 'PAGO') &&
      !order.hasVideoAccess &&
      !order.videoAddonPaid,
  },
};

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { orderIds, type } = await req.json();

    const campaign = CAMPAIGNS[type];
    if (!campaign) {
      return NextResponse.json({ error: 'Tipo de campanha inválido.' }, { status: 400 });
    }
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return NextResponse.json({ error: 'orderIds é obrigatório e não pode ser vazio.' }, { status: 400 });
    }
    if (orderIds.length > MAX_ORDERS_PER_CAMPAIGN) {
      return NextResponse.json({ error: `Máximo de ${MAX_ORDERS_PER_CAMPAIGN} pedidos por envio.` }, { status: 400 });
    }

    const result = { sent: 0, skipped: 0, failed: 0 };

    for (const orderId of orderIds) {
      try {
        const orderRef = doc(db, 'orders', String(orderId));
        const snap = await getDoc(orderRef);
        if (!snap.exists()) {
          result.skipped++;
          continue;
        }
        const order = snap.data();

        if (order.deletedAt || order[campaign.sentField] || !order.customerPhone || !campaign.isEligible(order)) {
          result.skipped++;
          continue;
        }

        const message = campaign.build({
          customerName: order.customerName,
          honoreeName: order.honoreeName,
          deliveryUrl: resolveDeliveryUrl(orderId),
        });

        const sendResult = await sendWhatsAppMessageDetailed(order.customerPhone, message, env);
        if (sendResult.success) {
          await updateDoc(orderRef, { [campaign.sentField]: new Date().toISOString() })
            .catch((e) => console.warn('[whatsapp/campaign] Falha ao marcar envio:', e.message));
          result.sent++;
        } else {
          result.failed++;
        }
      } catch (err) {
        console.warn('[whatsapp/campaign] Falha ao processar pedido da campanha:', err.message);
        result.failed++;
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Erro na rota /api/whatsapp/campaign:', error.message);
    return NextResponse.json({ error: 'Falha ao processar campanha.' }, { status: 500 });
  }
}
