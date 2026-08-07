import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWhatsAppMessageDetailed } from '@/lib/whatsapp';
import { resolveDeliveryUrl, buildRecoveryMessage } from '@/lib/whatsappTemplates';

export const runtime = 'edge';

// Substitui a campanha manual de recuperação (removida em 2026-08-07): lembrete automático de
// pagamento 6h e 12h depois da música ficar pronta, se o pedido continuar sem pagamento aprovado.
// Disparada por um agendamento externo (GitHub Actions, ver .github/workflows/payment-reminders.yml)
// — mesmo motivo do daily-sales-report: Cloudflare Pages não tem cron nativo. Ainda na W-API (ver
// src/lib/whatsapp.js) — migrar pra API Oficial exigiria um Template categoria Marketing, decisão
// futura separada.
function isValidSecret(req, env) {
  const expected = String(env?.REMINDERS_CRON_SECRET || process.env.REMINDERS_CRON_SECRET || '').trim();
  if (!expected) return false;
  const { searchParams } = new URL(req.url);
  return searchParams.get('secret') === expected;
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MAX_ORDERS_PER_RUN = 200;

function isUnpaid(order) {
  return order.paymentStatus !== 'PAGAMENTO_APROVADO' && order.paymentStatus !== 'PAGO';
}

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    if (!isValidSecret(req, env)) {
      return NextResponse.json({ error: 'Segredo inválido ou REMINDERS_CRON_SECRET não configurado.' }, { status: 401 });
    }

    const now = Date.now();
    const sixHoursAgoIso = new Date(now - SIX_HOURS_MS).toISOString();

    // Nunca getDocs sem where+limit (database.md). productionStatus+audioGeneratedAt é o índice
    // composto declarado em firestore.indexes.json.
    const ordersRef = collection(db, 'orders');
    const q = query(
      ordersRef,
      where('productionStatus', '==', 'AUDIO_GERADO'),
      where('audioGeneratedAt', '<=', sixHoursAgoIso),
      limit(MAX_ORDERS_PER_RUN)
    );

    let snap;
    try {
      snap = await getDocs(q);
    } catch (err) {
      console.error('[api/whatsapp/payment-reminders] Falha ao consultar o Firestore:', err.message);
      return NextResponse.json({ error: 'Falha ao consultar o Firestore.' }, { status: 502 });
    }

    const result = { checked: snap.size, sent6h: 0, sent12h: 0, skipped: 0, failed: 0 };

    for (const docSnap of snap.docs) {
      const order = docSnap.data();
      const orderId = docSnap.id;

      if (order.deletedAt || !isUnpaid(order) || !order.customerPhone || !order.audioGeneratedAt) {
        result.skipped++;
        continue;
      }

      const hoursSince = (now - new Date(order.audioGeneratedAt).getTime()) / (60 * 60 * 1000);
      const deliveryUrl = resolveDeliveryUrl(orderId);
      const message = buildRecoveryMessage({
        customerName: order.customerName,
        honoreeName: order.honoreeName,
        deliveryUrl,
      });

      try {
        if (hoursSince >= 12) {
          if (order.paymentReminder12hSentAt) {
            result.skipped++;
            continue;
          }
          const sendResult = await sendWhatsAppMessageDetailed(order.customerPhone, message, env);
          if (sendResult.success) {
            await updateDoc(doc(db, 'orders', orderId), { paymentReminder12hSentAt: new Date().toISOString() });
            result.sent12h++;
          } else {
            result.failed++;
          }
        } else {
          if (order.paymentReminder6hSentAt) {
            result.skipped++;
            continue;
          }
          const sendResult = await sendWhatsAppMessageDetailed(order.customerPhone, message, env);
          if (sendResult.success) {
            await updateDoc(doc(db, 'orders', orderId), { paymentReminder6hSentAt: new Date().toISOString() });
            result.sent6h++;
          } else {
            result.failed++;
          }
        }
      } catch (err) {
        console.warn('[api/whatsapp/payment-reminders] Falha ao processar pedido:', err.message);
        result.failed++;
      }
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[api/whatsapp/payment-reminders] Erro inesperado:', error.message);
    return NextResponse.json({ error: 'Erro interno.' }, { status: 500 });
  }
}
