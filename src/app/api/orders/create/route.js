import { NextResponse } from 'next/server';
import { collection, addDoc, query, where, getDocs, limit } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Limite de 5 músicas grátis por telefone/e-mail para quem nunca pagou. Antes só existia no cliente
// (criar/page.jsx:checkUserLimit), então chamar esta rota direto ignorava o limite (ver A-11 no
// AUDIT_REPORT.md). O localStorage do cliente é só um contador de conveniência, não uma trava real.
export async function isBlockedByFreeLimit(phone, email) {
  const ordersRef = collection(db, 'orders');
  const matches = [];

  if (phone && phone.replace(/\D/g, '').length >= 10) {
    const snap = await getDocs(query(ordersRef, where('customerPhone', '==', phone))).catch(() => null);
    if (snap) snap.forEach((d) => { if (!d.data().deletedAt) matches.push(d.data()); });
  }

  if (email && email.includes('@')) {
    const snap = await getDocs(query(ordersRef, where('customerEmail', '==', email))).catch(() => null);
    if (snap) {
      snap.forEach((d) => {
        const data = d.data();
        if (!data.deletedAt && !matches.some((o) => o.orderNumber === data.orderNumber)) matches.push(data);
      });
    }
  }

  const hasPaid = matches.some((o) => o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO');
  return !hasPaid && matches.length >= 5;
}

import { generateUniqueOrderNumber } from '@/lib/orderNumber';
export { generateUniqueOrderNumber };

export async function POST(req) {
  try {
    const formData = await req.json();

    // M-13 no AUDIT_REPORT.md: o consentimento aos termos precisa ser real (checkbox marcado pelo
    // cliente), verificado no servidor — nunca aceito por padrão.
    if (formData.termsAccepted !== true) {
      return NextResponse.json({ error: 'É necessário aceitar os Termos de Uso para continuar.' }, { status: 400 });
    }

    if (await isBlockedByFreeLimit(formData.customerPhone, formData.customerEmail)) {
      return NextResponse.json(
        { error: 'Limite de músicas gratuitas atingido. Finalize o pagamento de um pedido anterior para continuar.' },
        { status: 403 }
      );
    }

    const orderNumber = await generateUniqueOrderNumber();
    const createdAtIso = new Date().toISOString();

    const orderPayload = {
      orderNumber,
      userId: formData.userId || null,
      customerName: formData.customerName || 'Cliente',
      customerPhone: formData.customerPhone || '',
      customerEmail: formData.customerEmail || '',
      honoreeName: formData.honoreeName || '',
      recipientType: formData.recipientType || '',
      relationship: formData.relationship || '',
      occasion: formData.occasion || '',
      story: formData.story || '',
      importantMoments: formData.importantMoments || '',
      musicStyle: formData.musicStyle || '',
      musicMood: formData.musicMood || '',
      voiceType: formData.voiceType || '',
      coverUrl: formData.coverUrl || '',
      lyrics: formData.lyrics || '',
      termsAccepted: true,
      termsAcceptedAt: createdAtIso,
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      productionStatus: formData.lyrics ? 'LETRA_CRIADA' : 'EM_PRODUCAO',
      createdAt: createdAtIso,
      updatedAt: createdAtIso
    };

    const ordersRef = collection(db, 'orders');
    const docRef = await addDoc(ordersRef, orderPayload);

    console.log(`[API /orders/create] Pedido criado com sucesso no Firebase! ID: ${docRef.id}, Número: ${orderNumber}`);

    return NextResponse.json({
      success: true,
      orderId: docRef.id,
      orderNumber
    }, { status: 200 });

  } catch (error) {
    console.error("Erro na API /api/orders/create:", error);
    return NextResponse.json({ error: error.message || 'Erro ao criar pedido no banco de dados' }, { status: 500 });
  }
}
