import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { carregarContexto, garantirContaInstagram } from '@/lib/instagramAutomacao';
import { listarMidias, listarMidiasDeAnuncios, explicarErroMeta } from '@/lib/instagramGraph';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Posts/reels recentes do perfil + mídias dos anúncios ativos, para a tela /admin/automacao.
export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;

  try {
    const ctx = await carregarContexto(env);
    if (!ctx.supabase) return NextResponse.json({ error: 'Supabase não configurado.' }, { status: 500 });
    if (!ctx.token) {
      return NextResponse.json({ ok: true, conectado: false, motivo: 'sem_token', posts: [], anuncios: [] });
    }

    let config;
    try {
      config = await garantirContaInstagram(ctx);
    } catch (err) {
      console.warn('[admin/instagram/posts] Falha ao descobrir a conta:', err.code || err.name);
      return NextResponse.json({ ok: true, conectado: false, motivo: 'meta_erro', aviso: explicarErroMeta(err), posts: [], anuncios: [] });
    }
    if (!config.igUserId) {
      return NextResponse.json({ ok: true, conectado: false, motivo: 'sem_conta_instagram', posts: [], anuncios: [] });
    }

    let posts = [];
    try {
      posts = await listarMidias(ctx.token, config.igUserId, 30);
    } catch (err) {
      console.warn('[admin/instagram/posts] Falha ao listar posts:', err.code || err.name);
      return NextResponse.json({ ok: true, conectado: false, motivo: 'meta_erro', aviso: explicarErroMeta(err), posts: [], anuncios: [] });
    }

    let anuncios = [];
    let avisoAnuncios = null;
    if (ctx.adAccountId) {
      try {
        const idsDePosts = new Set(posts.map((p) => p.id));
        anuncios = (await listarMidiasDeAnuncios(ctx.token, ctx.adAccountId)).filter((a) => !idsDePosts.has(a.id));
      } catch (err) {
        console.warn('[admin/instagram/posts] Falha ao listar anúncios:', err.code || err.name);
        avisoAnuncios = explicarErroMeta(err);
      }
    } else {
      avisoAnuncios = 'Conta de anúncios não configurada (aba Anúncios → Conectar Meta API).';
    }

    return NextResponse.json({
      ok: true,
      conectado: true,
      conta: { username: config.igUsername },
      posts,
      anuncios,
      avisoAnuncios,
    });
  } catch (err) {
    console.error('[admin/instagram/posts] Erro inesperado:', err.message);
    return NextResponse.json({ error: 'Não foi possível carregar os posts.' }, { status: 500 });
  }
}
