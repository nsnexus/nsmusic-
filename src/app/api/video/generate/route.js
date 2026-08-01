import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { orderId, imageUrls } = await req.json();

    if (!orderId || !Array.isArray(imageUrls)) {
      return NextResponse.json({ error: 'orderId e imageUrls (array de fotos) são obrigatórios.' }, { status: 400 });
    }

    if (imageUrls.length < 10 || imageUrls.length > 20) {
      return NextResponse.json({ error: 'Você precisa enviar entre 10 e 20 fotos para gerar o vídeo.' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    // Atualiza o registro no Firestore
    await updateDoc(orderRef, {
      slideshowImages: imageUrls,
      videoStatus: 'SOLICITADO',
      videoProgress: 0,
      updatedAt: new Date().toISOString()
    });

    return NextResponse.json({
      success: true,
      message: 'Imagens registradas com sucesso para geração de vídeo.',
      orderId
    });

  } catch (error) {
    console.error("Erro na rota /api/video/generate:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
