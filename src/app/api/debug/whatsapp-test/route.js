import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { sendMusicReadyTemplate, resolveDeliveryUrl } from '@/lib/whatsapp';

export const runtime = 'edge';

// TODO(debug-temp): testa o envio real de WhatsApp pra um pedido específico, isolado da lógica de
// idempotência (whatsappSending/whatsappSent) do db.js — só pra ver o erro exato sem log de servidor.
// Nunca ecoa telefone. Remover depois de checado.
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'Informe orderId.' }, { status: 400 });
    }

    const snap = await getDoc(doc(db, 'orders', orderId));
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }
    const order = snap.data();

    const deliveryUrl = resolveDeliveryUrl(orderId);
    const result = await sendMusicReadyTemplate(order.customerPhone, {
      customerName: order.customerName,
      honoreeName: order.honoreeName,
      deliveryUrl,
    }, env);

    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
