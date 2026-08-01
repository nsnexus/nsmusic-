import { NextResponse } from 'next/server';
import { collection, addDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const formData = await req.json();

    const orderNumber = `NS-${Math.floor(10000 + Math.random() * 90000)}-2026`;
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
      paymentStatus: 'AGUARDANDO_PAGAMENTO',
      productionStatus: formData.lyrics ? 'LETRA_GERADA' : 'EM_PRODUCAO',
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
