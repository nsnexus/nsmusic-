import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { generateCartaText } from '@/lib/carta';

export const runtime = 'edge';

// Gera (ou regera) o texto da Carta Virtual, e também salva a versão editada pelo cliente.
//
// A carta normalmente já vem pronta do próprio applyPaymentApproval assim que o add-on é pago —
// esta rota existe para o "gerar de novo" e para persistir a edição feita em /entrega.
//
// AUTORIZAÇÃO: o acesso é verificado NO SERVIDOR contra o pedido (hasCartaAccess/cartaAddonPaid,
// escritos só por applyPaymentApproval). O orderId que chega do cliente é uma alegação, não uma
// permissão — sem esta checagem, qualquer um com um orderId geraria carta de graça
// (ver .claude/rules/security.md e C-01 no AUDIT_REPORT.md).
const MAX_TEXTO_CHARS = 2200;

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, texto } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const order = snap.data();
    const temAcesso = Boolean(order.hasCartaAccess || order.cartaAddonPaid);
    if (!temAcesso) {
      return NextResponse.json({ error: 'Carta não liberada para este pedido.' }, { status: 403 });
    }

    // Modo "salvar edição": o cliente mandou o texto dele, não pede geração nenhuma.
    if (typeof texto === 'string' && texto.trim()) {
      const limpo = texto.trim().slice(0, MAX_TEXTO_CHARS);
      await updateDoc(orderRef, {
        cartaTexto: limpo,
        cartaStatus: 'READY',
        cartaEditedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
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

    await updateDoc(orderRef, {
      cartaTexto: resultado.texto,
      cartaStatus: 'READY',
      cartaGeneratedAt: new Date().toISOString(),
      cartaGenerating: false,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, texto: resultado.texto });
  } catch (error) {
    console.error('[api/carta/generate] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao gerar a carta.' }, { status: 500 });
  }
}
