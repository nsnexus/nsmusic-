// Cliente da Graph API da Meta para os comentários do Instagram (posts, reels e anúncios).
//
// Usa a API do Instagram com login do Facebook (graph.facebook.com), a mesma família de token que o
// painel de anúncios já usa — é ela que dá acesso também aos comentários dos ANÚNCIOS, que não
// aparecem na lista de mídias do perfil (são lidos pelo `effective_instagram_media_id` do criativo).
//
// Limites da própria API que moldam este módulo:
//   - dá para LER, RESPONDER, OCULTAR e APAGAR comentário; NÃO existe endpoint para curtir
//     comentário no Instagram (só em Página do Facebook);
//   - só se responde comentário de primeiro nível, e não se responde comentário oculto.
//
// Nenhuma função aqui loga token nem devolve mensagem crua da Meta para o cliente do painel: o erro
// sai como { code, type } + um texto em português (ver `explicarErroMeta`).

export const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const TIMEOUT_MS = 12000;

// Permissões que o token precisa ter. `ads_read` só é exigida para os comentários de anúncio.
export const PERMISSOES_COMENTARIOS = [
  'instagram_basic',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
];
export const PERMISSAO_ANUNCIOS = 'ads_read';
export const PERMISSAO_PUBLICAR = 'instagram_content_publish';

/** IDs da Graph API são sempre numéricos — valida antes de montar qualquer URL com eles. */
export function isGraphId(valor) {
  return /^\d{5,40}$/.test(String(valor || ''));
}

export class MetaApiError extends Error {
  constructor(mensagem, { status = 0, code = null, type = null, subcode = null } = {}) {
    super(mensagem);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.subcode = subcode;
  }
}

/** Texto em português para mostrar no painel, sem repassar a mensagem crua da Meta. */
export function explicarErroMeta(err) {
  const code = Number(err?.code);
  if (Number(err?.subcode) === 2207005) return 'O Instagram só aceita imagem em JPG. Salve a imagem como .jpg na pasta.';
  if (code === 190) return 'O token da Meta expirou ou foi revogado. Gere um novo na aba Conexão.';
  if (code === 10 || code === 200 || code === 3) {
    return 'O token não tem permissão para isso. Confira as permissões na aba Conexão.';
  }
  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return 'A Meta limitou as chamadas por enquanto. Tente de novo em alguns minutos.';
  }
  if (code === 100) return 'A Meta recusou a operação (item inexistente, apagado ou não suportado).';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'A Meta demorou demais para responder.';
  return 'Não foi possível falar com a Meta agora.';
}

async function graphFetch(path, { token, method = 'GET', params = {} } = {}) {
  if (!token) throw new MetaApiError('Token da Meta ausente.', { code: 190 });
  const url = new URL(path.startsWith('http') ? path : `${GRAPH_BASE}/${path.replace(/^\//, '')}`);
  const init = { method, signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Authorization: `Bearer ${token}` } };

  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  } else {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) body.set(k, String(v));
    }
    init.body = body;
  }

  const res = await fetch(url.toString(), init);
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.error) {
    const e = json?.error || {};
    throw new MetaApiError(e.message || `HTTP ${res.status}`, { status: res.status, code: e.code ?? null, type: e.type ?? null, subcode: e.error_subcode ?? null });
  }
  return json || {};
}

/** Diagnóstico do token: quais permissões foram concedidas e quais faltam. */
export async function verificarPermissoes(token) {
  const json = await graphFetch('me/permissions', { token });
  const concedidas = (json.data || []).filter((p) => p.status === 'granted').map((p) => p.permission);
  const faltando = PERMISSOES_COMENTARIOS.filter((p) => !concedidas.includes(p));
  return {
    concedidas,
    faltando,
    temAnuncios: concedidas.includes(PERMISSAO_ANUNCIOS),
    temPublicar: concedidas.includes(PERMISSAO_PUBLICAR),
  };
}

/** Contas profissionais do Instagram ligadas às Páginas que o token enxerga. */
export async function listarContasInstagram(token) {
  const json = await graphFetch('me/accounts', {
    token,
    params: { fields: 'name,instagram_business_account{id,username}', limit: 50 },
  });
  return (json.data || [])
    .filter((p) => p.instagram_business_account?.id)
    .map((p) => ({
      igUserId: String(p.instagram_business_account.id),
      username: p.instagram_business_account.username || '',
      pageName: p.name || '',
    }));
}

function normalizarMidia(m) {
  return {
    id: String(m.id),
    origem: 'post',
    legenda: m.caption || '',
    tipo: m.media_product_type || m.media_type || '',
    link: m.permalink || '',
    miniatura: m.thumbnail_url || (m.media_type === 'VIDEO' ? '' : m.media_url) || '',
    data: m.timestamp || null,
    comentarios: Number(m.comments_count) || 0,
    curtidas: Number(m.like_count) || 0,
  };
}

/** Posts e reels mais recentes do perfil. */
export async function listarMidias(token, igUserId, limit = 25) {
  if (!isGraphId(igUserId)) throw new MetaApiError('ID da conta do Instagram inválido.', { code: 100 });
  const json = await graphFetch(`${igUserId}/media`, {
    token,
    params: {
      fields: 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,comments_count,like_count',
      limit: Math.max(1, Math.min(50, limit)),
    },
  });
  return (json.data || []).map(normalizarMidia);
}

/**
 * Anúncios ativos da conta de anúncios com a mídia do Instagram que cada um gerou.
 * Vários anúncios podem apontar para a mesma mídia (mesmo criativo em conjuntos diferentes) — a
 * lista sai deduplicada por mídia, guardando o nome do primeiro anúncio e da campanha.
 */
export async function listarMidiasDeAnuncios(token, adAccountId, limit = 60) {
  const conta = String(adAccountId || '').replace(/^act_/, '');
  if (!isGraphId(conta)) return [];
  const json = await graphFetch(`act_${conta}/ads`, {
    token,
    params: {
      fields: 'name,campaign{name},creative{effective_instagram_media_id,instagram_permalink_url,thumbnail_url,body}',
      effective_status: JSON.stringify(['ACTIVE']),
      limit: Math.max(1, Math.min(100, limit)),
    },
  });

  const porMidia = new Map();
  for (const ad of json.data || []) {
    const mediaId = ad.creative?.effective_instagram_media_id;
    if (!isGraphId(mediaId) || porMidia.has(String(mediaId))) continue;
    porMidia.set(String(mediaId), {
      id: String(mediaId),
      origem: 'anuncio',
      legenda: ad.creative?.body || '',
      tipo: 'AD',
      link: ad.creative?.instagram_permalink_url || '',
      miniatura: ad.creative?.thumbnail_url || '',
      data: null,
      comentarios: null,
      curtidas: null,
      anuncio: ad.name || '',
      campanha: ad.campaign?.name || '',
    });
  }
  return [...porMidia.values()];
}

function normalizarComentario(c) {
  return {
    id: String(c.id),
    texto: c.text || '',
    usuario: c.username || c.from?.username || '',
    data: c.timestamp || null,
    oculto: c.hidden === true,
    curtidas: Number(c.like_count) || 0,
    respostas: (c.replies?.data || []).map((r) => ({
      id: String(r.id),
      texto: r.text || '',
      usuario: r.username || '',
      data: r.timestamp || null,
    })),
  };
}

/** Comentários de primeiro nível de uma mídia (post, reel ou mídia de anúncio), com as respostas. */
export async function listarComentarios(token, mediaId, limit = 50) {
  if (!isGraphId(mediaId)) throw new MetaApiError('ID da mídia inválido.', { code: 100 });
  const json = await graphFetch(`${mediaId}/comments`, {
    token,
    params: {
      fields: 'id,text,username,timestamp,hidden,like_count,replies.limit(20){id,text,username,timestamp}',
      limit: Math.max(1, Math.min(100, limit)),
    },
  });
  return (json.data || []).map(normalizarComentario);
}

export async function responderComentario(token, commentId, mensagem) {
  if (!isGraphId(commentId)) throw new MetaApiError('ID do comentário inválido.', { code: 100 });
  const json = await graphFetch(`${commentId}/replies`, { token, method: 'POST', params: { message: mensagem } });
  return { id: json.id ? String(json.id) : null };
}

export async function ocultarComentario(token, commentId, ocultar = true) {
  if (!isGraphId(commentId)) throw new MetaApiError('ID do comentário inválido.', { code: 100 });
  await graphFetch(`${commentId}`, { token, method: 'POST', params: { hide: ocultar ? 'true' : 'false' } });
  return { ok: true };
}

export async function apagarComentario(token, commentId) {
  if (!isGraphId(commentId)) throw new MetaApiError('ID do comentário inválido.', { code: 100 });
  await graphFetch(`${commentId}`, { token, method: 'DELETE' });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Publicação (exige a permissão instagram_content_publish).
//
// O Instagram publica em duas etapas: cria um "container" apontando para a imagem numa URL
// pública (é a Meta quem baixa o arquivo) e depois publica o container. Só aceita JPEG.
// ---------------------------------------------------------------------------------------------

/** Container de uma imagem. `legenda` só no post de imagem única; item de carrossel não leva. */
export async function criarContainerImagem(token, igUserId, { imageUrl, legenda, itemDeCarrossel = false }) {
  if (!isGraphId(igUserId)) throw new MetaApiError('ID da conta do Instagram inválido.', { code: 100 });
  const json = await graphFetch(`${igUserId}/media`, {
    token,
    method: 'POST',
    params: {
      image_url: imageUrl,
      caption: itemDeCarrossel ? undefined : legenda,
      is_carousel_item: itemDeCarrossel ? 'true' : undefined,
    },
  });
  return String(json.id);
}

export async function criarContainerCarrossel(token, igUserId, { filhos, legenda }) {
  if (!isGraphId(igUserId)) throw new MetaApiError('ID da conta do Instagram inválido.', { code: 100 });
  const json = await graphFetch(`${igUserId}/media`, {
    token,
    method: 'POST',
    params: { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda },
  });
  return String(json.id);
}

/** FINISHED quando o container está pronto para publicar; ERROR/EXPIRED quando não vai ficar. */
export async function statusDoContainer(token, containerId) {
  if (!isGraphId(containerId)) throw new MetaApiError('ID do container inválido.', { code: 100 });
  const json = await graphFetch(`${containerId}`, { token, params: { fields: 'status_code' } });
  return String(json.status_code || '');
}

export async function publicarContainer(token, igUserId, containerId) {
  if (!isGraphId(igUserId) || !isGraphId(containerId)) throw new MetaApiError('ID inválido.', { code: 100 });
  const json = await graphFetch(`${igUserId}/media_publish`, { token, method: 'POST', params: { creation_id: containerId } });
  return String(json.id);
}

export async function buscarLinkDaMidia(token, mediaId) {
  if (!isGraphId(mediaId)) return '';
  const json = await graphFetch(`${mediaId}`, { token, params: { fields: 'permalink' } });
  return String(json.permalink || '');
}
