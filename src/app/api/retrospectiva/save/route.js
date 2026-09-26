import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

const MAX_MOMENTOS = 20;
const MAX_QUIZ = 10;
const MAX_TEXTO = 400;
const MAX_TITULO = 120;
const MAX_FOTOS = 20;

function limparTexto(valor, max) {
  return String(valor ?? '').trim().slice(0, max);
}

function limparData(valor) {
  const str = String(valor ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(str) ? str : '';
}

function isAllowedMediaUrl(u) {
  if (typeof u !== 'string') return false;
  const str = u.trim();
  if (!str.startsWith('https://')) return false;
  return (
    str.includes('.r2.dev') ||
    str.includes('nsnexus.com.br') ||
    str.includes('cloudflare') ||
    str.includes('/retrospectiva/') ||
    str.includes('/photos/') ||
    str.includes('/slideshow/') ||
    str.startsWith('https://firebasestorage.googleapis.com/')
  );
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const body = await req.json().catch(() => ({}));
    const { orderId, retrospectiva } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }
    if (!retrospectiva || typeof retrospectiva !== 'object') {
      return NextResponse.json({ error: 'Conteúdo da retrospectiva ausente.' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    if (!order.hasRetrospectivaAccess && !order.retrospectivaAddonPaid) {
      return NextResponse.json({ error: 'Retrospectiva não liberada para este pedido.' }, { status: 403 });
    }

    const momentos = Array.isArray(retrospectiva.momentos) ? retrospectiva.momentos : [];
    const quiz = Array.isArray(retrospectiva.quiz) ? retrospectiva.quiz : [];
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
          correta: Number.isInteger(correta) && correta >= 0 && correta < opcoes.length ? correta : 0,
        };
      }).filter((q) => q.pergunta && q.opcoes.length >= 2),
    };

    const nowIso = new Date().toISOString();
    await updateOrder(orderId, {
      retrospectiva: limpa,
      retrospectivaAtualizadaEm: nowIso,
      updatedAt: nowIso,
    }, env);

    return NextResponse.json({ ok: true, retrospectiva: limpa });
  } catch (error) {
    console.error('[api/retrospectiva/save] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar a retrospectiva.' }, { status: 500 });
  }
}
