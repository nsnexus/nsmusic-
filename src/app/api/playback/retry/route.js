import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requestPlaybackGeneration } from '@/lib/playback';

export const runtime = 'edge';

// Retry manual do add-on de Playback (instrumental) quando a geração anterior falhou — dois motivos
// reais já observados no mesmo pedido de teste (wI7Z7ro5a6jJfKCZpBRe, 03/09/2026): um 422 transitório
// da Kie.ai (já coberto por retry automático em src/lib/playback.js) e um callback com `code:200` mas
// sem `instrumental_url` (causa ainda não confirmada do lado da Kie.ai). Sem esse botão, o cliente
// pagava e ficava sem produto até alguém mexer no Firestore manualmente.
//
// Autorização: orderId vem do cliente (é uma alegação, não permissão — ver .claude/rules/security.md),
// então a checagem real é `hasPlaybackAccess`/`playbackAddonPaid` já gravado no pedido pelo servidor
// na aprovação do pagamento, nunca um campo que o cliente possa ter mandado agora.
export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const order = snap.data();
    if (!order.hasPlaybackAccess && !order.playbackAddonPaid) {
      return NextResponse.json({ error: 'Este pedido não tem o Playback pago' }, { status: 403 });
    }

    if (order.playbackStatus === 'READY') {
      return NextResponse.json({ error: 'O playback já está pronto' }, { status: 400 });
    }
    if (order.playbackStatus === 'PROCESSING' || order.playbackRequesting) {
      return NextResponse.json({ error: 'Já existe uma geração em andamento' }, { status: 409 });
    }

    const sunoTaskId = order.sunoTaskId;
    const audioId = order.audioIds?.[0];
    if (!sunoTaskId || !audioId) {
      return NextResponse.json({ error: 'Pedido sem referência da faixa original — não é possível gerar' }, { status: 400 });
    }

    // Mesma flag getDoc+updateDoc já usada na primeira tentativa (src/lib/payments.js) — evita duplo
    // disparo se o cliente clicar mais de uma vez rápido (cada chamada cobra crédito da Kie.ai).
    await updateDoc(orderRef, { playbackRequesting: true, playbackStatus: 'PROCESSING', updatedAt: new Date().toISOString() });

    const genResult = await requestPlaybackGeneration({ orderId, sunoTaskId, audioId }, env);
    await updateDoc(orderRef, { playbackRequesting: false }).catch(() => {});

    if (!genResult.ok) {
      return NextResponse.json({ error: 'Não foi possível iniciar a geração agora. Tente novamente em instantes.' }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[playback/retry] Erro:', error.message);
    return NextResponse.json({ error: 'Erro interno ao tentar gerar novamente' }, { status: 500 });
  }
}
