import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, getCountFromServer } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { getAdminWhatsAppNumber } from '@/lib/payments';

export const runtime = 'edge';

// Disparada por um agendamento externo (GitHub Actions, ver .github/workflows/daily-sales-report.yml)
// já que o Cloudflare Pages não tem cron nativo (só Workers têm Cron Trigger — ver docs/ARCHITECTURE.md
// §4). Sem REPORTS_CRON_SECRET configurado a rota fica bloqueada por padrão: ao contrário dos
// webhooks de pagamento (que têm uma segunda barreira reconsultando o provedor), esta rota não tem
// verificação independente — só o segredo protege contra qualquer um disparar o envio de WhatsApp.
function isValidSecret(req, env) {
  const expected = String(env?.REPORTS_CRON_SECRET || process.env.REPORTS_CRON_SECRET || '').trim();
  if (!expected) return false;
  const { searchParams } = new URL(req.url);
  return searchParams.get('secret') === expected;
}

// Brasil não observa horário de verão desde 2019 — deslocamento fixo de -3h em relação ao UTC.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function getBrtDayBoundsIso(reference = new Date()) {
  const shifted = new Date(reference.getTime() - BRT_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) + BRT_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  const dateLabel = `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`;
  return { startIso: startUtc.toISOString(), endIso: endUtc.toISOString(), dateLabel };
}

// Consulta de contagem (getCountFromServer) em vez de baixar os documentos — mais barata e evita a
// varredura sem limit proibida em database.md. Filtro de intervalo num único campo não exige índice
// composto (Firestore cria índice de campo único automaticamente).
async function countInRange(field, startIso, endIso) {
  const ordersRef = collection(db, 'orders');
  const q = query(ordersRef, where(field, '>=', startIso), where(field, '<', endIso));
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    if (!isValidSecret(req, env)) {
      return NextResponse.json({ error: 'Segredo inválido ou REPORTS_CRON_SECRET não configurado.' }, { status: 401 });
    }

    const { startIso, endIso, dateLabel } = getBrtDayBoundsIso();

    let requests, musicPayments, videoPayments;
    try {
      [requests, musicPayments, videoPayments] = await Promise.all([
        countInRange('createdAt', startIso, endIso),
        countInRange('paidAt', startIso, endIso),
        countInRange('videoPaidAt', startIso, endIso),
      ]);
    } catch (err) {
      console.error('[api/reports/daily-sales] Falha ao contar pedidos no Firestore:', err.message);
      return NextResponse.json({ error: 'Falha ao consultar o Firestore.' }, { status: 502 });
    }

    const adminPhone = getAdminWhatsAppNumber();
    if (!adminPhone) {
      console.warn('[api/reports/daily-sales] ADMIN_WHATSAPP não configurado, resumo não enviado.');
      return NextResponse.json(
        { sent: false, reason: 'admin_whatsapp_not_configured', requests, musicPayments, videoPayments },
        { status: 200 }
      );
    }

    const message = `📊 *Resumo NSMusic — ${dateLabel}*\n\n📝 Solicitações: ${requests}\n🎵 Músicas pagas: ${musicPayments}\n🎬 Vídeos pagos: ${videoPayments}`;

    const sent = await sendWhatsAppMessage(adminPhone, message, env);
    if (!sent) {
      console.warn('[api/reports/daily-sales] Falha ao enviar o resumo via WhatsApp.');
      return NextResponse.json(
        { sent: false, reason: 'whatsapp_send_failed', requests, musicPayments, videoPayments },
        { status: 502 }
      );
    }

    return NextResponse.json({ sent: true, requests, musicPayments, videoPayments, date: dateLabel });
  } catch (error) {
    console.error('[api/reports/daily-sales] Erro inesperado:', error.message);
    return NextResponse.json({ error: 'Falha ao gerar o resumo de vendas.' }, { status: 500 });
  }
}
