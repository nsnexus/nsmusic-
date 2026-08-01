import { NextResponse } from 'next/server';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const body = await req.json();
    const { orderId, audioUrl, audioFiles, paymentStatus, productionStatus } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const updateData = { updatedAt: new Date().toISOString() };
    if (audioUrl !== undefined) updateData.audioUrl = audioUrl;
    if (audioFiles !== undefined) updateData.audioFiles = audioFiles;
    if (paymentStatus !== undefined) updateData.paymentStatus = paymentStatus;
    if (productionStatus !== undefined) updateData.productionStatus = productionStatus;

    await updateDoc(doc(db, 'orders', orderId), updateData);

    return NextResponse.json({ success: true, orderId, updated: updateData }, { status: 200 });
  } catch (error) {
    console.error("Erro na API /api/orders/update:", error);
    return NextResponse.json({ error: error.message || 'Erro ao atualizar pedido' }, { status: 500 });
  }
}
