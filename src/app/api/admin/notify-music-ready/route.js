import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { notifyMusicReady } from '@/lib/db';

export const runtime = 'edge';

// Reenvio manual do WhatsApp "música pronta" — criado no incidente de 14-19/08/2026 (export sem
// import local em src/lib/whatsapp.js quebrava o envio automático sem deixar whatsappSending
// consistente). force:true ignora whatsappSent/whatsappSending, pra destravar pedidos presos.
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

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const orderData = snap.data();
    if (!orderData.audioUrl) {
      return NextResponse.json({ error: 'Pedido ainda não tem música gerada.' }, { status: 400 });
    }

    const result = await notifyMusicReady(orderRef, orderData, orderId, { force: true });

    if (result.sent) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: result.reason === 'no_phone' ? 'Pedido sem telefone.' : 'Falha ao enviar.' }, { status: 502 });
  } catch (error) {
    console.error('[api/admin/notify-music-ready] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao notificar cliente.' }, { status: 500 });
  }
}
