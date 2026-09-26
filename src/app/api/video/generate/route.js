import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { orderId, imageUrls } = await req.json();

    if (!orderId || !Array.isArray(imageUrls)) {
      return NextResponse.json({ error: 'orderId e imageUrls (array de fotos) são obrigatórios.' }, { status: 400 });
    }

    if (imageUrls.length < 10 || imageUrls.length > 20) {
      return NextResponse.json({ error: 'Você precisa enviar entre 10 e 20 fotos para gerar o vídeo.' }, { status: 400 });
    }

    const orderData = await getOrder(orderId, env);
    if (!orderData) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    if (!orderData.hasVideoAccess && !orderData.videoAddonPaid) {
      return NextResponse.json({ error: 'O add-on de vídeo ainda não foi pago para este pedido.' }, { status: 403 });
    }

    await updateOrder(orderId, {
      slideshowImages: imageUrls,
      videoStatus: 'SOLICITADO',
      videoProgress: 0,
      updatedAt: new Date().toISOString()
    }, env);

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
