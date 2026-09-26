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

function isAllowedMediaUrl(u) {
  if (typeof u !== 'string') return false;
  const str = u.trim();
  if (!str.startsWith('https://')) return false;
  return (
    str.startsWith('https://firebasestorage.googleapis.com/') ||
    str.includes('.r2.dev') ||
    str.includes('nsnexus.com.br') ||
    str.includes('cloudflare') ||
    str.includes('/retrospectiva/') ||
    str.includes('/photos/') ||
    str.includes('/slideshow/')
  );
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

    let order = null;
    let orderRef = null;
    try {
      orderRef = doc(db, 'orders', orderId);
      const snap = await getDoc(orderRef);
      if (snap.exists()) {
        order = snap.data();
      }
    } catch (e) {
      console.warn('[api/retrospectiva/save] Erro ao consultar Firestore:', e.message);
    }

    if (!order) {
      try {
        const { getOrder } = await import('@/lib/supabaseDb');
        order = await getOrder(orderId);
      } catch (e) {}
    }

    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    if (!order.hasRetrospectivaAccess && !order.retrospectivaAddonPaid) {
      return NextResponse.json({ error: 'Retrospectiva não liberada para este pedido.' }, { status: 403 });
    }

    const momentos = Array.isArray(retrospectiva.momentos) ? retrospectiva.momentos : [];
    const quiz = Array.isArray(retrospectiva.quiz) ? retrospectiva.quiz : [];
    // Fotos PRÓPRIAS da retrospectiva — independentes das fotos do Vídeo Homenagem
    // (order.slideshowImages). Suporta URLs do Cloudflare R2 e Firebase Storage.
    const fotos = Array.isArray(retrospectiva.fotos) ? retrospectiva.fotos : [];

    const limpa = {
      titulo: limparTexto(retrospectiva.titulo, MAX_TITULO),
      contadorLabel: limparTexto(retrospectiva.contadorLabel, 60),
      dataInicio: limparData(retrospectiva.dataInicio),
      fotos: fotos.slice(0, MAX_FOTOS).filter(isAllowedMediaUrl).map((u) => u.slice(0, 600)),
      momentos: momentos.slice(0, MAX_MOMENTOS).map((m) => ({
        data: limparData(m?.data),
        titulo: limparTexto(m?.titulo, MAX_TITULO),
        texto: limparTexto(m?.texto, MAX_TEXTO),
        fotoUrl: isAllowedMediaUrl(m?.fotoUrl) ? m.fotoUrl.slice(0, 600) : '',
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

    const nowIso = new Date().toISOString();
    if (orderRef) {
      await updateDoc(orderRef, {
        retrospectiva: limpa,
        retrospectivaAtualizadaEm: nowIso,
        updatedAt: nowIso,
      }).catch(e => console.warn('[api/retrospectiva/save] Falha Firestore:', e.message));
    }

    try {
      const { updateOrder } = await import('@/lib/supabaseDb');
      await updateOrder(orderId, {
        retrospectiva: limpa,
        updatedAt: nowIso,
      });
    } catch (sbErr) {
      console.warn('[api/retrospectiva/save] Falha ao espelhar Supabase:', sbErr.message);
    }

    return NextResponse.json({ ok: true, retrospectiva: limpa });
  } catch (error) {
    console.error('[api/retrospectiva/save] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar a retrospectiva.' }, { status: 500 });
  }
}
