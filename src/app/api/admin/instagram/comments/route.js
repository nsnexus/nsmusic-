import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { carregarContexto, decidirComentario } from '@/lib/instagramAutomacao';
import {
  isGraphId,
  listarComentarios,
  responderComentario,
  ocultarComentario,
  apagarComentario,
  explicarErroMeta,
} from '@/lib/instagramGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function erroMeta(err, onde) {
  console.warn(`[admin/instagram/comments] ${onde}:`, err.code || err.name);
  return NextResponse.json({ error: explicarErroMeta(err) }, { status: 502 });
}

// Comentários de uma mídia (post, reel ou mídia de anúncio).
export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const mediaId = new URL(req.url).searchParams.get('mediaId') || '';
  if (!isGraphId(mediaId)) return NextResponse.json({ error: 'mediaId inválido.' }, { status: 400 });

  try {
    const ctx = await carregarContexto(env);
    if (!ctx.token) return NextResponse.json({ error: 'Token da Meta não configurado.' }, { status: 400 });
    const comentarios = await listarComentarios(ctx.token, mediaId, 80);
    return NextResponse.json({ ok: true, comentarios, proprioUsuario: ctx.config.igUsername });
  } catch (err) {
    if (err?.name === 'MetaApiError' || err?.name === 'TimeoutError') return erroMeta(err, 'Falha ao listar');
    console.error('[admin/instagram/comments] Erro inesperado:', err.message);
    return NextResponse.json({ error: 'Não foi possível carregar os comentários.' }, { status: 500 });
  }
}

// Ações manuais: responder, ocultar, mostrar, apagar e pedir uma sugestão de resposta à IA.
export async function POST(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  const body = await req.json().catch(() => ({}));
  const acao = String(body?.acao || '');
  const commentId = String(body?.commentId || '');
  if (!['responder', 'ocultar', 'mostrar', 'apagar', 'sugerir'].includes(acao)) {
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400 });
  }

  try {
    const ctx = await carregarContexto(env);

    if (acao === 'sugerir') {
      const comentario = String(body?.comentario || '').trim();
      if (!comentario) return NextResponse.json({ error: 'Comentário vazio.' }, { status: 400 });
      try {
        const decisao = await decidirComentario(
          {
            comentario,
            usuario: String(body?.usuario || ''),
            legenda: String(body?.legenda || ''),
            origem: body?.origem === 'anuncio' ? 'anuncio' : 'post',
          },
          ctx.config,
          env,
        );
        return NextResponse.json({ ok: true, decisao });
      } catch (err) {
        console.warn('[admin/instagram/comments] IA não respondeu:', err.name);
        return NextResponse.json({ error: 'A IA não respondeu agora. Tente de novo.' }, { status: 502 });
      }
    }

    if (!isGraphId(commentId)) return NextResponse.json({ error: 'commentId inválido.' }, { status: 400 });
    if (!ctx.token) return NextResponse.json({ error: 'Token da Meta não configurado.' }, { status: 400 });

    if (acao === 'responder') {
      const mensagem = String(body?.mensagem || '').trim();
      if (!mensagem) return NextResponse.json({ error: 'Escreva a resposta.' }, { status: 400 });
      if (mensagem.length > 1000) return NextResponse.json({ error: 'Resposta longa demais (máx. 1000 caracteres).' }, { status: 400 });
      const criado = await responderComentario(ctx.token, commentId, mensagem);
      return NextResponse.json({ ok: true, replyId: criado.id });
    }
    if (acao === 'ocultar') await ocultarComentario(ctx.token, commentId, true);
    if (acao === 'mostrar') await ocultarComentario(ctx.token, commentId, false);
    if (acao === 'apagar') await apagarComentario(ctx.token, commentId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err?.name === 'MetaApiError' || err?.name === 'TimeoutError') return erroMeta(err, `Falha em "${acao}"`);
    console.error('[admin/instagram/comments] Erro inesperado:', err.message);
    return NextResponse.json({ error: 'Não foi possível concluir a ação.' }, { status: 500 });
  }
}
