import { NextResponse } from 'next/server';
import { collection, query, where, orderBy, limit, getDocs, doc, getDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Classifica o formato do telefone sem nunca devolver o valor — BR válido (com código do país) é
// 12 ou 13 dígitos; fora disso é provável LID (ver achado 27/08/2026, route.js:extractSenderPhone).
function classifyPhoneDigits(raw) {
  if (!raw) return { present: false, digits: 0, looksLikeLid: false };
  const digits = String(raw).replace(/\D/g, '').length;
  return { present: true, digits, looksLikeLid: digits !== 12 && digits !== 13 };
}

// TODO(debug-temp): rota provisória pra diagnosticar por que uma notificação de WhatsApp não
// chegou. Busca por orderNumber, orderId, últimos dígitos do telefone, ou lista os N mais recentes
// (?recent=20) — nunca ecoa telefone/e-mail (ver .claude/rules/security.md), no modo recent nem o
// formato do orderNumber. Remover depois de checado.
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get('orderNumber');
    const orderId = searchParams.get('orderId') || searchParams.get('id');
    const phoneLast4 = searchParams.get('phoneLast4');
    const recentParam = searchParams.get('recent');

    if (recentParam) {
      const n = Math.min(Math.max(parseInt(recentParam, 10) || 20, 1), 50);
      const snap = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(n * 2)));
      const rows = [];
      snap.forEach((d) => {
        if (rows.length >= n) return;
        const data = d.data();
        // Mesmo filtro do painel admin — sessões de WhatsApp em rascunho e docs de config não são pedidos reais.
        if (d.id.startsWith('config_') || d.id.startsWith('session_') || data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') return;
        rows.push({
          id: d.id,
          orderNumber: data.orderNumber || null,
          createdAt: data.createdAt || null,
          productionStatus: data.productionStatus || null,
          paymentStatus: data.paymentStatus || null,
          whatsappRequested: Boolean(data.whatsappRequested),
          whatsappSenderPhone: classifyPhoneDigits(data.whatsappSenderPhone),
          whatsappWaitAckSent: Boolean(data.whatsappWaitAckSent),
          whatsappSent: Boolean(data.whatsappSent),
          readyTemplateSent: Boolean(data.readyTemplateSent),
          paymentWhatsappSent: Boolean(data.paymentWhatsappSent),
        });
      });
      return NextResponse.json({ count: rows.length, orders: rows });
    }

    if (!orderNumber && !orderId && !phoneLast4) {
      return NextResponse.json({ error: 'Informe orderNumber, orderId, phoneLast4 ou recent.' }, { status: 400 });
    }

    const ordersRef = collection(db, 'orders');
    let snap;
    let found = null;

    if (orderId) {
      const docSnap = await getDoc(doc(db, 'orders', orderId));
      if (docSnap.exists()) {
        found = { id: docSnap.id, data: docSnap.data() };
      }
    } else if (orderNumber) {
      snap = await getDocs(query(ordersRef, where('orderNumber', '==', orderNumber), limit(1)));
    } else {
      // Sem índice em customerPhone terminando em X — varre só os mais recentes via createdAt seria
      // ideal, mas sem orderBy+where combinado sem índice composto; aceitável pra debug pontual.
      snap = await getDocs(query(ordersRef, limit(500)));
    }

    if (!found && snap) {
      snap.forEach((d) => {
        const data = d.data();
        if (orderNumber) {
          found = { id: d.id, data };
        } else if (String(data.customerPhone || '').endsWith(phoneLast4)) {
          found = { id: d.id, data };
        }
      });
    }

    if (!found) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const { customerPhone, customerEmail, customerName, honoreeName, ...safe } = found.data;

    return NextResponse.json({
      id: found.id,
      hasPhone: Boolean(customerPhone),
      ...safe,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
