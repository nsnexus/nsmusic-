// Cliente da Graph API para os comentários da Página do Facebook (posts e anúncios).
//
// Diferenças em relação ao Instagram que moldam este módulo:
//   - toda leitura/escrita na Página exige o token DA PÁGINA, que é obtido em `me/accounts` a partir
//     do mesmo token do usuário do sistema já usado pela automação do Instagram (nunca é salvo);
//   - IDs de post e de comentário vêm no formato "123_456";
//   - o autor do comentário (`from`) só vem com a permissão pages_read_user_content;
//   - responder = POST /{comentario}/comments; ocultar = POST /{comentario} com is_hidden.
//
// Mesma regra do instagramGraph.js: nada de token em log, erro sai pelo `explicarErroMeta`.

import { graphFetch, MetaApiError } from './instagramGraph.js';

// Além de pages_show_list e pages_read_engagement (que o Instagram já pede).
export const PERMISSOES_FACEBOOK = ['pages_manage_engagement', 'pages_read_user_content'];

/** ID de objeto do Facebook: numérico ou "numérico_numérico" (post e comentário). */
export function isFacebookId(valor) {
  return /^\d{5,40}(_\d{5,40})?$/.test(String(valor || ''));
}

/** Páginas que o token enxerga, com o token de cada uma (fica só em memória). */
export async function listarPaginas(token) {
  const json = await graphFetch('me/accounts', {
    token,
    params: { fields: 'id,name,access_token,instagram_business_account{id}', limit: 50 },
  });
  return (json.data || [])
    .filter((p) => isFacebookId(p.id) && p.access_token)
    .map((p) => ({
      pageId: String(p.id),
      nome: p.name || '',
      token: p.access_token,
      igUserId: p.instagram_business_account?.id ? String(p.instagram_business_account.id) : '',
    }));
}

/** A Página escolhida no painel; senão a ligada ao Instagram da automação; senão a primeira. */
export function escolherPagina(paginas, { pageId = '', igUserId = '' } = {}) {
  const lista = paginas || [];
  return lista.find((p) => pageId && p.pageId === pageId)
    || lista.find((p) => igUserId && p.igUserId === igUserId)
    || lista[0]
    || null;
}

/** Posts publicados mais recentes da Página, com a contagem de comentários. */
export async function listarPostsDaPagina(pageToken, pageId, limit = 25) {
  if (!isFacebookId(pageId)) throw new MetaApiError('ID da Página inválido.', { code: 100 });
  const json = await graphFetch(`${pageId}/published_posts`, {
    token: pageToken,
    params: {
      fields: 'id,message,permalink_url,created_time,comments.summary(total_count).limit(0)',
      limit: Math.max(1, Math.min(50, limit)),
    },
  });
  return (json.data || []).filter((p) => isFacebookId(p.id)).map((p) => ({
    id: String(p.id),
    rede: 'facebook',
    origem: 'post',
    legenda: p.message || '',
    link: p.permalink_url || '',
    data: p.created_time || null,
    comentarios: Number(p.comments?.summary?.total_count) || 0,
  }));
}

/** Posts da Página que os anúncios ativos geraram (deduplicados). */
export function postsFacebookDosAnuncios(anuncios) {
  const porPost = new Map();
  for (const ad of anuncios || []) {
    const postId = ad.creative?.effective_object_story_id;
    if (!isFacebookId(postId) || porPost.has(String(postId))) continue;
    porPost.set(String(postId), {
      id: String(postId),
      rede: 'facebook',
      origem: 'anuncio',
      legenda: ad.creative?.body || '',
      link: `https://www.facebook.com/${postId}`,
      data: null,
      comentarios: null,
      anuncio: ad.name || '',
      campanha: ad.campaign?.name || '',
    });
  }
  return [...porPost.values()];
}

function normalizarComentario(c) {
  return {
    id: String(c.id),
    texto: c.message || '',
    usuario: c.from?.name || '',
    usuarioId: c.from?.id ? String(c.from.id) : '',
    data: c.created_time || null,
    oculto: c.is_hidden === true,
    respostas: (c.comments?.data || []).map((r) => ({
      id: String(r.id),
      texto: r.message || '',
      usuario: r.from?.name || '',
      usuarioId: r.from?.id ? String(r.from.id) : '',
      data: r.created_time || null,
    })),
  };
}

/** Comentários de primeiro nível de um post (orgânico ou de anúncio), com as respostas. */
export async function listarComentariosFacebook(pageToken, postId, limit = 50) {
  if (!isFacebookId(postId)) throw new MetaApiError('ID do post inválido.', { code: 100 });
  const json = await graphFetch(`${postId}/comments`, {
    token: pageToken,
    params: {
      fields: 'id,message,from{id,name},created_time,is_hidden,comments.limit(20){id,message,from{id,name},created_time}',
      filter: 'toplevel',
      order: 'reverse_chronological',
      limit: Math.max(1, Math.min(100, limit)),
    },
  });
  return (json.data || []).filter((c) => isFacebookId(c.id)).map(normalizarComentario);
}

export async function responderComentarioFacebook(pageToken, commentId, mensagem) {
  if (!isFacebookId(commentId)) throw new MetaApiError('ID do comentário inválido.', { code: 100 });
  const json = await graphFetch(`${commentId}/comments`, { token: pageToken, method: 'POST', params: { message: mensagem } });
  return { id: json.id ? String(json.id) : null };
}

export async function ocultarComentarioFacebook(pageToken, commentId, ocultar = true) {
  if (!isFacebookId(commentId)) throw new MetaApiError('ID do comentário inválido.', { code: 100 });
  await graphFetch(`${commentId}`, { token: pageToken, method: 'POST', params: { is_hidden: ocultar ? 'true' : 'false' } });
  return { ok: true };
}
