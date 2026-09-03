import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

// Salva o conteúdo da Retrospectiva (add-on, ver src/lib/pricing.js:retrospectiva_addon).
//
// AUTORIZAÇÃO: o acesso é verificado NO SERVIDOR contra o pedido
// (hasRetrospectivaAccess/retrospectivaAddonPaid, escritos só por applyPaymentApproval). O orderId
// que chega do cliente é uma alegação, não uma permissão (ver .claude/rules/security.md).
//
// Também não confia no TAMANHO do que o cliente manda: a retrospectiva é exibida numa página
// pública e fica no documento do pedido, que tem limite de 1 MiB no Firestore
// (.claude/rules/database.md) — por isso os limites abaixo.
const MAX_MOMENTOS = 20;
const MAX_QUIZ = 10;
const MAX_TEXTO = 400;
const MAX_TITULO = 120;
const MAX_FOTOS = 20;

function limparTexto(valor, max) {
  return String(valor ?? '').trim().slice(0, max);
}

// Aceita só 'YYYY-MM-DD' — o contador ao vivo na página pública faz conta com isso, e um valor
// livre viraria "NaN anos" na tela de um cliente que pagou.
function limparData(valor) {
  const str = String(valor ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : '';
}

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const { orderId, retrospectiva } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }
    if (!retrospectiva || typeof retrospectiva !== 'object') {
      return NextResponse.json({ error: 'Conteúdo da retrospectiva ausente.' }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const snap = await getDoc(orderRef);
    if (!snap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const order = snap.data();
    if (!order.hasRetrospectivaAccess && !order.retrospectivaAddonPaid) {
      return NextResponse.json({ error: 'Retrospectiva não liberada para este pedido.' }, { status: 403 });
    }

    const momentos = Array.isArray(retrospectiva.momentos) ? retrospectiva.momentos : [];
    const quiz = Array.isArray(retrospectiva.quiz) ? retrospectiva.quiz : [];
    // Fotos PRÓPRIAS da retrospectiva — independentes das fotos do Vídeo Homenagem
    // (order.slideshowImages). Sem isso, quem não comprou o vídeo não tinha NENHUMA foto pra
    // colocar na retrospectiva (achado 03/09/2026, relatado pelo dono do estúdio). O upload em si
    // acontece no navegador (Firebase Storage, ver RetrospectivaAddonCard.jsx); aqui só persiste a
    // lista de URLs já enviadas.
    const fotos = Array.isArray(retrospectiva.fotos) ? retrospectiva.fotos : [];

    const limpa = {
      titulo: limparTexto(retrospectiva.titulo, MAX_TITULO),
      contadorLabel: limparTexto(retrospectiva.contadorLabel, 60),
      dataInicio: limparData(retrospectiva.dataInicio),
      fotos: fotos.slice(0, MAX_FOTOS).filter((u) => typeof u === 'string' && u.startsWith('https://firebasestorage.googleapis.com/')).map((u) => u.slice(0, 600)),
      momentos: momentos.slice(0, MAX_MOMENTOS).map((m) => ({
        data: limparData(m?.data),
        titulo: limparTexto(m?.titulo, MAX_TITULO),
        texto: limparTexto(m?.texto, MAX_TEXTO),
        fotoUrl: typeof m?.fotoUrl === 'string' ? m.fotoUrl.slice(0, 600) : '',
      })).filter((m) => m.titulo || m.texto || m.fotoUrl),
      quiz: quiz.slice(0, MAX_QUIZ).map((q) => {
        const opcoes = (Array.isArray(q?.opcoes) ? q.opcoes : [])
          .slice(0, 4)
          .map((o) => limparTexto(o, 120))
          .filter(Boolean);
        const correta = Number(q?.correta);
        return {
          pergunta: limparTexto(q?.pergunta, MAX_TEXTO),
          opcoes,
          // Índice fora do intervalo das opções deixaria a pergunta sem resposta certa possível.
          correta: Number.isInteger(correta) && correta >= 0 && correta < opcoes.length ? correta : 0,
        };
      }).filter((q) => q.pergunta && q.opcoes.length >= 2),
    };

    await updateDoc(orderRef, {
      retrospectiva: limpa,
      retrospectivaAtualizadaEm: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, retrospectiva: limpa });
  } catch (error) {
    console.error('[api/retrospectiva/save] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar a retrospectiva.' }, { status: 500 });
  }
}
