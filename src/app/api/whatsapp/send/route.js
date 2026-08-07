import { NextResponse } from 'next/server';
import { sendWhatsAppMessageDetailed } from '@/lib/whatsapp';
import { resolveDeliveryUrl, buildMusicReadyMessage, buildPaymentApprovedMessage } from '@/lib/whatsappTemplates';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Servidor busca os dados do pedido pelo orderId em vez de confiar no texto que o admin montou no
// browser (mais seguro e consistente com o resto do projeto — o cliente só escolhe QUAL mensagem,
// nunca O QUE ela diz).
export async function POST(req) {
  try {
    let envVars = process.env;
    try {
      if (getRequestContext().env) {
        envVars = getRequestContext().env;
      }
    } catch (e) {}

    const auth = await requireAdmin(req, envVars);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { orderId, tipo } = await req.json();

    if (!orderId || !['musica', 'pagamento'].includes(tipo)) {
      return NextResponse.json(
        { error: 'Campos "orderId" e "tipo" ("musica" ou "pagamento") são obrigatórios' },
        { status: 400 }
      );
    }

    const orderSnap = await getDoc(doc(db, 'orders', orderId));
    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const order = orderSnap.data();
    if (!order.customerPhone) {
      return NextResponse.json({ error: 'Pedido não tem telefone do cliente cadastrado.' }, { status: 400 });
    }

    const vars = {
      customerName: order.customerName,
      honoreeName: order.honoreeName,
      deliveryUrl: resolveDeliveryUrl(orderId),
    };

    const message = tipo === 'musica' ? buildMusicReadyMessage(vars) : buildPaymentApprovedMessage(vars);
    const result = await sendWhatsAppMessageDetailed(order.customerPhone, message, envVars);

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } else {
      return NextResponse.json(
        { error: result.error || 'Falha ao enviar mensagem.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Erro na rota /api/whatsapp/send:', error.message);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
