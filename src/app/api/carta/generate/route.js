import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { generateCartaText } from '@/lib/carta';

export const runtime = 'edge';

const MAX_TEXTO_CHARS = 2200;

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const { orderId, texto } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const temAcesso = Boolean(order.hasCartaAccess || order.cartaAddonPaid);
    if (!temAcesso) {
      return NextResponse.json({ error: 'Carta não liberada para este pedido.' }, { status: 403 });
    }

    // Modo "salvar edição": o cliente mandou o texto dele, não pede geração nenhuma.
    if (typeof texto === 'string' && texto.trim()) {
      const limpo = texto.trim().slice(0, MAX_TEXTO_CHARS);
      await updateOrder(orderId, {
        cartaTexto: limpo,
        cartaStatus: 'READY',
        cartaEditedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, env);
      return NextResponse.json({ ok: true, texto: limpo, editada: true });
    }

    // Modo geração: escreve a carta a partir da história que o cliente já contou.
    const resultado = await generateCartaText(order);
    if (!resultado.ok) {
      const motivo = resultado.error === 'missing_story'
        ? 'Este pedido não tem história registrada para escrever a carta.'
        : 'Não foi possível escrever a carta agora. Tente novamente em instantes.';
      return NextResponse.json({ error: motivo }, { status: 422 });
    }

    await updateOrder(orderId, {
      cartaTexto: resultado.texto,
      cartaStatus: 'READY',
      cartaGeneratedAt: new Date().toISOString(),
      cartaGenerating: false,
      updatedAt: new Date().toISOString(),
    }, env);

    return NextResponse.json({ ok: true, texto: resultado.texto });
  } catch (error) {
    console.error('[api/carta/generate] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao gerar a carta.' }, { status: 500 });
  }
}
