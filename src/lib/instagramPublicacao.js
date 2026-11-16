// Publicação diária no Instagram a partir de uma pasta do Google Drive.
//
// Combinado da pasta: dentro da pasta raiz configurada no painel, uma subpasta por dia com o nome
// no formato AAAA-MM-DD. Dentro dela, as imagens em JPG (uma = foto; várias = carrossel, na ordem
// do nome do arquivo) e um `legenda.txt`. Quem monta a pasta é o dono (hoje, via ChatGPT).
//
// Guardado na tabela `config` do Supabase:
//   instagram_publicacao        — liga/desliga, horário, pasta e a conta de serviço do Google
//   instagram_publicacao_state  — um registro por dia (iniciada / publicado / erro) + histórico
//
// A regra que não pode quebrar: NUNCA publicar o mesmo dia duas vezes. Por isso o dia é marcado
// como "iniciada" ANTES de qualquer chamada de publicação, e uma tentativa que ficou "iniciada"
// sem terminar não é repetida sozinha — pode ter saído no Instagram mesmo sem a gente saber. Só o
// dono destrava, pelo painel, depois de olhar o perfil.

import { getSupabaseEdge } from './supabase-edge.js';
import { readEnvValue } from './envValue.js';
import { resolverSiteUrl } from './siteUrl.js';
import { carregarContexto, garantirContaInstagram } from './instagramAutomacao.js';
import {
  criarContainerImagem,
  criarContainerCarrossel,
  statusDoContainer,
  publicarContainer,
  buscarLinkDaMidia,
  explicarErroMeta,
} from './instagramGraph.js';
import {
  listarPasta,
  lerTexto,
  lerContaDeServico,
  isDriveId,
  explicarErroDrive,
  MIME_PASTA,
  MIME_GOOGLE_DOC,
} from './googleDrive.js';

export const CHAVE_CONFIG = 'instagram_publicacao';
export const CHAVE_ESTADO = 'instagram_publicacao_state';

export const MAX_IMAGENS = 10;
export const MAX_LEGENDA = 2200;
export const MAX_BYTES_IMAGEM = 8 * 1024 * 1024;
const MAX_TENTATIVAS_POR_DIA = 3;
const MAX_DIAS_GUARDADOS = 90;
const VALIDADE_DO_LINK_MS = 30 * 60 * 1000;
const FUSO = 'America/Sao_Paulo';

export function configPadrao() {
  return { ligada: false, horario: '09:00', pastaId: '', contaDeServico: null };
}

export function normalizarHorario(valor) {
  const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function normalizarConfig(valor) {
  const base = configPadrao();
  const v = valor && typeof valor === 'object' ? valor : {};
  return {
    ligada: v.ligada === true,
    horario: normalizarHorario(v.horario) || base.horario,
    pastaId: isDriveId(v.pastaId) ? String(v.pastaId) : '',
    contaDeServico: lerContaDeServico(v.contaDeServico),
  };
}

/** Data (AAAA-MM-DD) e hora (HH:MM) atuais no fuso de Brasília. */
export function agoraEmBrasilia(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(agora);
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

async function lerChave(supabase, chave) {
  const { data, error } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
  if (error) throw new Error(`Falha ao ler a configuração (${chave}).`);
  return data?.valor && typeof data.valor === 'object' ? data.valor : null;
}

async function gravarChave(supabase, chave, valor) {
  const { error } = await supabase.from('config').upsert({ chave, valor, updated_at: new Date().toISOString() });
  if (error) throw new Error(`Falha ao salvar a configuração (${chave}).`);
}

export async function carregarConfigPublicacao(env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { supabase: null, config: configPadrao() };
  return { supabase, config: normalizarConfig(await lerChave(supabase, CHAVE_CONFIG)) };
}

export async function salvarConfigPublicacao(supabase, config) {
  await gravarChave(supabase, CHAVE_CONFIG, normalizarConfig(config));
}

export async function lerEstadoPublicacao(supabase) {
  const v = (await lerChave(supabase, CHAVE_ESTADO)) || {};
  return { dias: v.dias && typeof v.dias === 'object' ? v.dias : {} };
}

function podarDias(dias) {
  const chaves = Object.keys(dias).sort().reverse().slice(0, MAX_DIAS_GUARDADOS);
  return Object.fromEntries(chaves.map((k) => [k, dias[k]]));
}

async function gravarDia(supabase, estado, data, registro) {
  estado.dias = podarDias({ ...estado.dias, [data]: registro });
  await gravarChave(supabase, CHAVE_ESTADO, { dias: estado.dias });
}

// --- Link assinado para a Meta baixar a imagem ------------------------------------------------
// O Instagram só publica imagem que ele mesmo consiga baixar de uma URL pública. Em vez de abrir a
// pasta do Drive para o mundo, a rota /api/instagram/midia serve UM arquivo, só com assinatura
// válida e por tempo curto.

async function hmacHex(segredo, mensagem) {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey('raw', enc.encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, enc.encode(mensagem));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function segredoDeAssinatura(env = {}) {
  return readEnvValue(env, 'CRON_SECRET');
}

export async function montarLinkDaMidia(arquivoId, env = {}, agora = Date.now()) {
  const segredo = segredoDeAssinatura(env);
  if (!segredo) throw new Error('CRON_SECRET não configurado.');
  const expira = agora + VALIDADE_DO_LINK_MS;
  const assinatura = await hmacHex(segredo, `${arquivoId}.${expira}`);
  const base = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));
  // Termina em .jpg porque há leitores de URL que decidem o tipo pelo final do endereço.
  return `${base}/api/instagram/midia?f=${encodeURIComponent(arquivoId)}&e=${expira}&s=${assinatura}&n=post.jpg`;
}

export async function conferirAssinatura({ arquivoId, expira, assinatura }, env = {}, agora = Date.now()) {
  const segredo = segredoDeAssinatura(env);
  if (!segredo || !isDriveId(arquivoId) || !/^[a-f0-9]{64}$/.test(String(assinatura || ''))) return false;
  const exp = Number(expira);
  if (!Number.isFinite(exp) || exp < agora) return false;
  const esperado = await hmacHex(segredo, `${arquivoId}.${exp}`);
  // Comparação sem atalho: percorre tudo mesmo depois da primeira diferença.
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i += 1) diferenca |= esperado.charCodeAt(i) ^ assinatura.charCodeAt(i);
  return diferenca === 0;
}

// --- Leitura da pasta --------------------------------------------------------------------------

const EXT_JPG = /\.jpe?g$/i;
const EXT_IMAGEM_NAO_ACEITA = /\.(png|webp|heic|gif|bmp|tiff?)$/i;

/**
 * Transforma a lista de arquivos de uma pasta do dia no post a publicar.
 * Função pura: devolve { imagens, arquivoLegenda, problemas } — com problema, não publica.
 */
export function montarPostDaPasta(arquivos) {
  const problemas = [];
  const imagens = [];
  let arquivoLegenda = null;

  for (const a of arquivos || []) {
    if (a.mime === MIME_PASTA) continue;
    const ehJpg = a.mime === 'image/jpeg' || (EXT_JPG.test(a.nome) && !a.mime.startsWith('image/'));
    if (ehJpg) {
      if (a.tamanho > MAX_BYTES_IMAGEM) problemas.push(`"${a.nome}" passa de 8 MB.`);
      imagens.push(a);
      continue;
    }
    if (a.mime.startsWith('image/') || EXT_IMAGEM_NAO_ACEITA.test(a.nome)) {
      problemas.push(`"${a.nome}" não está em JPG — o Instagram só aceita .jpg.`);
      continue;
    }
    const ehTexto = a.mime === 'text/plain' || a.mime === MIME_GOOGLE_DOC || /\.txt$/i.test(a.nome);
    if (ehTexto && /^legenda/i.test(a.nome) && !arquivoLegenda) arquivoLegenda = a;
  }

  imagens.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR', { numeric: true }));
  if (imagens.length === 0 && problemas.length === 0) problemas.push('Nenhuma imagem .jpg na pasta.');
  if (imagens.length > MAX_IMAGENS) problemas.push(`São ${imagens.length} imagens; o carrossel aceita no máximo ${MAX_IMAGENS}.`);
  if (!arquivoLegenda) problemas.push('Falta o arquivo legenda.txt.');

  return { imagens, arquivoLegenda, problemas };
}

/** Lê a pasta de um dia no Drive. Devolve { existe, imagens, legenda, problemas }. */
export async function lerPostDoDia(config, data) {
  const subpastas = await listarPasta(config.contaDeServico, config.pastaId, { apenasPastas: true });
  const pasta = subpastas.find((p) => p.nome.trim() === data);
  if (!pasta) return { existe: false, imagens: [], legenda: '', problemas: [], proximas: datasFuturas(subpastas, data) };

  const arquivos = await listarPasta(config.contaDeServico, pasta.id);
  const post = montarPostDaPasta(arquivos);
  let legenda = '';
  if (post.arquivoLegenda) {
    legenda = (await lerTexto(config.contaDeServico, post.arquivoLegenda)).trim();
    if (!legenda) post.problemas.push('O legenda.txt está vazio.');
    if (legenda.length > MAX_LEGENDA) post.problemas.push(`A legenda tem ${legenda.length} caracteres; o limite do Instagram é ${MAX_LEGENDA}.`);
  }
  return { existe: true, imagens: post.imagens, legenda, problemas: post.problemas, proximas: datasFuturas(subpastas, data) };
}

function datasFuturas(subpastas, hoje) {
  return subpastas
    .map((p) => p.nome.trim())
    .filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n) && n > hoje)
    .sort()
    .slice(0, 14);
}

// --- A publicação ------------------------------------------------------------------------------

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function aguardarContainer(token, containerId, tentativas = 6) {
  for (let i = 0; i < tentativas; i += 1) {
    const status = await statusDoContainer(token, containerId);
    if (status === 'FINISHED') return true;
    if (status === 'ERROR' || status === 'EXPIRED') return false;
    await esperar(2000);
  }
  return false;
}

/** Decide se a passada automática deve tentar publicar o dia. Função pura. */
export function devePublicarAgora({ config, registro, hora }) {
  if (!config.ligada) return { publicar: false, motivo: 'desligada' };
  if (hora < config.horario) return { publicar: false, motivo: 'antes_do_horario' };
  if (!registro) return { publicar: true };
  if (registro.status === 'publicado') return { publicar: false, motivo: 'ja_publicado' };
  if (registro.status === 'iniciada') return { publicar: false, motivo: 'tentativa_sem_conclusao' };
  if ((registro.tentativas || 0) >= MAX_TENTATIVAS_POR_DIA) return { publicar: false, motivo: 'tentativas_esgotadas' };
  return { publicar: true };
}

/**
 * Publica o post do dia. `manual: true` é o botão "Publicar agora" do painel: ignora o horário, o
 * liga/desliga e o teto de tentativas — mas NUNCA republica um dia já publicado nem passa por cima
 * de uma tentativa sem conclusão (para isso existe `liberarDia`).
 */
export async function executarPublicacao({ env = {}, manual = false, agora = new Date() } = {}) {
  const { supabase, config } = await carregarConfigPublicacao(env);
  if (!supabase) return { ok: false, motivo: 'supabase_ausente' };
  if (!config.ligada && !manual) return { ok: true, motivo: 'desligada' };
  if (!config.contaDeServico || !config.pastaId) return { ok: false, motivo: 'drive_nao_configurado' };

  const { data, hora } = agoraEmBrasilia(agora);
  const estado = await lerEstadoPublicacao(supabase);
  const registro = estado.dias[data] || null;

  if (manual) {
    if (registro?.status === 'publicado') return { ok: true, motivo: 'ja_publicado', data, registro };
    if (registro?.status === 'iniciada') return { ok: false, motivo: 'tentativa_sem_conclusao', data, registro };
  } else {
    const decisao = devePublicarAgora({ config, registro, hora });
    if (!decisao.publicar) return { ok: true, motivo: decisao.motivo, data };
  }

  // 1. O que tem na pasta de hoje.
  let post;
  try {
    post = await lerPostDoDia(config, data);
  } catch (err) {
    console.warn('[publicacao] Falha ao ler o Drive:', err.status || err.name);
    return { ok: false, motivo: 'drive_erro', erro: explicarErroDrive(err), data };
  }
  // Pasta ainda não existe: não conta como tentativa — o ChatGPT pode salvar mais tarde.
  if (!post.existe) return { ok: true, motivo: 'sem_pasta_hoje', data };

  const tentativas = (registro?.tentativas || 0) + 1;
  const falhar = async (erro) => {
    const reg = { status: 'erro', erro, tentativas, em: new Date().toISOString() };
    await gravarDia(supabase, estado, data, reg);
    return { ok: false, motivo: 'erro', erro, data, registro: reg };
  };

  if (post.problemas.length > 0) return falhar(post.problemas.join(' '));

  // 2. Credenciais do Instagram (as mesmas da automação de comentários).
  const ctx = await carregarContexto(env);
  if (!ctx.token) return falhar('Nenhum token da Meta conectado (aba Conexão).');
  let conta;
  try {
    conta = await garantirContaInstagram(ctx);
  } catch (err) {
    return falhar(explicarErroMeta(err));
  }
  if (!conta.igUserId) return falhar('O token não enxerga a conta do Instagram (aba Conexão).');

  // 3. Trava: marca o dia como iniciado e confere que foi ESTA execução que ficou com ele — o
  //    agendador e o botão do painel podem rodar ao mesmo tempo.
  const execucao = crypto.randomUUID();
  await gravarDia(supabase, estado, data, { status: 'iniciada', execucao, tentativas, em: new Date().toISOString() });
  const conferido = await lerEstadoPublicacao(supabase);
  if (conferido.dias[data]?.execucao !== execucao) return { ok: true, motivo: 'outra_execucao_em_andamento', data };

  // 4. Containers. Até aqui nada aparece no perfil, então falha nesta etapa pode ser repetida.
  let containerFinal;
  try {
    const links = await Promise.all(post.imagens.map((img) => montarLinkDaMidia(img.id, env)));
    if (links.length === 1) {
      containerFinal = await criarContainerImagem(ctx.token, conta.igUserId, { imageUrl: links[0], legenda: post.legenda });
    } else {
      const filhos = [];
      for (const link of links) {
        filhos.push(await criarContainerImagem(ctx.token, conta.igUserId, { imageUrl: link, itemDeCarrossel: true }));
      }
      containerFinal = await criarContainerCarrossel(ctx.token, conta.igUserId, { filhos, legenda: post.legenda });
    }
    if (!(await aguardarContainer(ctx.token, containerFinal))) {
      return falhar('O Instagram não terminou de processar as imagens. Confira se são JPG válidos.');
    }
  } catch (err) {
    console.warn('[publicacao] Falha ao preparar o post:', err.code || err.name);
    return falhar(err?.name === 'MetaApiError' ? explicarErroMeta(err) : 'Não foi possível preparar o post.');
  }

  // 5. Publica. Daqui em diante, erro NÃO volta para "erro": fica "iniciada", porque o post pode
  //    ter saído. O painel mostra o aviso e o dono decide.
  let mediaId;
  try {
    mediaId = await publicarContainer(ctx.token, conta.igUserId, containerFinal);
  } catch (err) {
    console.warn('[publicacao] Falha ao publicar:', err.code || err.name);
    const reg = {
      status: 'iniciada', execucao, tentativas, em: new Date().toISOString(),
      erro: `${explicarErroMeta(err)} Confira no perfil se o post saiu antes de tentar de novo.`,
    };
    await gravarDia(supabase, estado, data, reg);
    return { ok: false, motivo: 'tentativa_sem_conclusao', erro: reg.erro, data, registro: reg };
  }

  let link = '';
  try {
    link = await buscarLinkDaMidia(ctx.token, mediaId);
  } catch (err) {
    console.warn('[publicacao] Post publicado, mas o link não veio:', err.code || err.name);
  }

  const reg = {
    status: 'publicado', mediaId, link, tentativas, imagens: post.imagens.length,
    legenda: post.legenda.slice(0, 200), em: new Date().toISOString(),
  };
  try {
    await gravarDia(supabase, estado, data, reg);
  } catch (err) {
    // Publicou e não gravou: o registro fica "iniciada", que também impede uma segunda publicação.
    console.error('[publicacao] Post publicado, mas o estado não foi gravado:', err.message);
  }
  return { ok: true, motivo: 'publicado', data, registro: reg };
}

/** Destrava um dia que ficou em erro ou sem conclusão, para poder tentar de novo. */
export async function liberarDia(supabase, data) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data || ''))) return false;
  const estado = await lerEstadoPublicacao(supabase);
  const registro = estado.dias[data];
  if (!registro || registro.status === 'publicado') return false;
  const { [data]: _removido, ...resto } = estado.dias;
  await gravarChave(supabase, CHAVE_ESTADO, { dias: resto });
  return true;
}
