// Automação do número ADM (o WhatsApp de atendimento, separado do número que dispara as mensagens
// automáticas). Ele já tem um menu de boas-vindas do próprio WhatsApp Business; aqui tratamos:
//   "1" (ajustar minha música) → pergunta o que o cliente quer ajustar (letra, ritmo, voz...);
//   "3" (não consigo baixar)   → 1 pedido pago: diz qual é (código, data) e manda os MP3;
//                                vários: lista os pedidos numerados e o cliente escolhe um ou "TODAS";
//   "4" (quero criar)          → manda o link da plataforma;
//   "5" (outros assuntos)      → pergunta o motivo do contato e deixa a conversa para o dono.
// E o comando do DONO "/musicas", digitado por ele na conversa: apaga o comando e faz o mesmo que o
// "3" na hora (sem esperar o intervalo de reenvio). As músicas vão em MP3 (documento) e em áudio.
// Qualquer outra mensagem fica em silêncio: é o dono quem responde.
//
// O número ADM fala por um de dois canais (o campo `ctx.evolution` guarda o canal ativo; tem `tipo`):
//   - OFICIAL (Cloud API da Meta), quando WHATSAPP_ADM_PHONE_NUMBER_ID está definida — ver
//     whatsappAdmCloud.js. Não tem QR code nem risco de restrição por automação.
//   - Evolution API (QR code), o padrão antigo: uma SEGUNDA instância na mesma Evolution.
// A configuração mora na tabela `config` (chave `whatsapp_adm`); endereço e chave da Evolution vêm da
// configuração principal.

import { getSupabaseEdge } from './supabase-edge.js';
import { getEvolutionConfig } from './whatsapp.js';
import { resolveCriarUrl } from './whatsappTemplates.js';
import { findOrdersByPhone } from './orderLookup.js';
import { isBonusOrder } from './trafficSource.js';
import { DOMINIO_CANONICO } from './siteUrl.js';
import { configCloudAdm, enviarTextoCloud, enviarAudioCloud, estadoCloud } from './whatsappAdmCloud.js';

export const CHAVE_ADM = 'whatsapp_adm';
export const INSTANCIA_PADRAO = 'nsmusic-adm';
const MAX_ARQUIVOS = 10;
const MAX_LISTA = 9;
const VALIDADE_ESCOLHA_MS = 30 * 60 * 1000;
const INTERVALO_REENVIO_MS = 5 * 60 * 1000;
const STATUS_PAGO = new Set(['PAGAMENTO_APROVADO', 'PAGO']);

/**
 * O pedido pode ser entregue? Pago, ou MÚSICA BÔNUS cujo pedido principal está pago — mesma regra
 * da página de entrega. A bônus é um pedido separado e, se foi gerada antes de o principal ser pago
 * (ex.: PIX liberado à mão depois), fica com status "aguardando pagamento" para sempre.
 */
export function pedidoLiberado(p, todos = []) {
  if (!p) return false;
  if (STATUS_PAGO.has(String(p.paymentStatus || ''))) return true;
  if (!isBonusOrder(p)) return false;
  const paiId = p.parentOrderId || p.orderRef || p.extras?.parentOrderId || p.extras?.orderRef;
  const pai = (todos || []).find((o) => o && paiId && (o.id === paiId || o.orderNumber === paiId))
    || (todos || []).find((o) => o && (o.secondGenerationOrderId === p.id || o.segundaGeracaoOrderId === p.id));
  return Boolean(pai && STATUS_PAGO.has(String(pai.paymentStatus || '')));
}

export function normalizarConfigAdm(valor) {
  const v = valor && typeof valor === 'object' ? valor : {};
  const instancia = String(v.instanceName || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  return {
    ligada: v.ligada === true,
    instanceName: instancia || INSTANCIA_PADRAO,
    apiKey: typeof v.apiKey === 'string' ? v.apiKey.trim() : '',
    segredo: /^[a-f0-9]{32,64}$/.test(String(v.segredo || '')) ? String(v.segredo) : '',
    ultimasAcoes: Array.isArray(v.ultimasAcoes) ? v.ultimasAcoes.slice(0, 30) : [],
  };
}

export function gerarSegredo() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function carregarAdm(env = {}) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { supabase: null, config: normalizarConfigAdm(null), evolution: null };
  const { data, error } = await supabase.from('config').select('valor').eq('chave', CHAVE_ADM).maybeSingle();
  if (error) throw new Error('Falha ao ler a configuração do WhatsApp ADM.');
  const config = normalizarConfigAdm(data?.valor);
  const cloud = configCloudAdm(env);
  if (cloud) return { supabase, config, evolution: cloud };
  const principal = await getEvolutionConfig(env);
  const evolution = principal?.baseUrl
    ? { baseUrl: principal.baseUrl, apiKey: config.apiKey || principal.token, chaveGlobal: principal.token, instanceName: config.instanceName }
    : null;
  return { supabase, config, evolution };
}

export async function salvarAdm(supabase, config) {
  const { error } = await supabase.from('config').upsert({ chave: CHAVE_ADM, valor: normalizarConfigAdm(config), updated_at: new Date().toISOString() });
  if (error) throw new Error('Falha ao salvar a configuração do WhatsApp ADM.');
}

function limparNumero(texto) {
  return String(texto || '').replace(/[️⃣]/g, '').trim().replace(/[.)!\s]+$/, '');
}

/** "3", " 3 ", "3.", "3️⃣" → '3'. Qualquer coisa além de um 1, 3, 4 ou 5 sozinho → null. */
export function interpretarOpcao(texto) {
  const limpo = limparNumero(texto);
  return ['1', '3', '4', '5'].includes(limpo) ? limpo : null;
}

/** Resposta à lista de pedidos: número da lista (1..total) ou 'todas'. Qualquer outra coisa → null. */
export function interpretarEscolha(texto, total) {
  const limpo = limparNumero(texto).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(todas?|todos?)( as musicas| os pedidos)?$/.test(limpo)) return 'todas';
  if (/^\d{1,2}$/.test(limpo)) {
    const n = Number(limpo);
    if (n >= 1 && n <= total) return n;
  }
  return null;
}

/** "16/11/2026 às 17:13", no horário de Brasília. */
export function dataHoraBr(valor) {
  const d = valor?.toDate ? valor.toDate() : new Date(valor);
  if (!valor || Number.isNaN(d.getTime())) return '';
  const partes = Object.fromEntries(new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} às ${partes.hour}:${partes.minute}`;
}

/** Pedidos pagos que têm áudio, do mais novo para o mais antigo (como vêm da busca). */
export function pedidosPagosComAudio(pedidos) {
  return (pedidos || []).filter((p) => p?.id && pedidoLiberado(p, pedidos)
    && ((Array.isArray(p.audioFiles) && p.audioFiles.some(Boolean)) || p.audioUrl));
}

function descreverPedido(p, comBonus = false) {
  const codigo = p.orderNumber || String(p.id).slice(0, 8);
  const bonus = isBonusOrder(p) ? ' (🎁 música bônus)' : (comBonus ? ' (+ 🎁 música bônus)' : '');
  const para = `${p.honoreeName ? ` — para ${p.honoreeName}` : ''}${bonus}`;
  const quando = dataHoraBr(p.createdAt);
  return `*${codigo}*${para}${quando ? `\n   criado em ${quando}` : ''}`;
}

const descreverGrupo = (g) => descreverPedido(g.principal, g.pedidos.length > 1);

/**
 * Junta cada música bônus ao pedido principal dela: na lista aparecem como UM pedido e são
 * enviadas juntas. Bônus sem o principal na lista vira um item próprio. Mais novos primeiro.
 * @returns {{ principal: Object, pedidos: Object[] }[]}
 */
export function agruparComBonus(pagos) {
  const grupos = [];
  const porPai = new Map();
  for (const p of pagos || []) {
    if (isBonusOrder(p)) continue;
    const g = { principal: p, pedidos: [p] };
    grupos.push(g);
    porPai.set(p.id, g);
    if (p.orderNumber) porPai.set(p.orderNumber, g);
  }
  for (const p of pagos || []) {
    if (!isBonusOrder(p)) continue;
    const paiId = p.parentOrderId || p.orderRef || p.extras?.parentOrderId || p.extras?.orderRef;
    const g = porPai.get(paiId)
      || grupos.find((x) => x.principal.secondGenerationOrderId === p.id || x.principal.segundaGeracaoOrderId === p.id);
    if (g) g.pedidos.push(p);
    else grupos.push({ principal: p, pedidos: [p] });
  }
  return grupos.sort((a, b) => String(b.principal.createdAt || '').localeCompare(String(a.principal.createdAt || '')));
}

export function textoListaPedidos(grupos) {
  const linhas = grupos.map((g, i) => `${i + 1}️⃣ ${descreverGrupo(g)}`);
  return `Encontrei ${grupos.length} pedidos pagos no seu número 🎵\n\n${linhas.join('\n\n')}\n\n`
    + `Responda com o *número* do pedido que você quer receber, ou *TODAS* para receber todas as músicas.`;
}

export const TEXTO_AJUSTE = 'Claro, vamos deixar sua música do jeitinho que você quer! 🎶\n\n'
  + 'Me conta o que você gostaria de ajustar:\n\n'
  + '✍️ *Letra* — alguma palavra, nome ou trecho\n'
  + '🥁 *Ritmo / estilo* — mais animada, mais lenta, outro gênero\n'
  + '🎤 *Voz* — masculina, feminina, outro tom\n'
  + '💬 *Outra coisa*\n\n'
  + 'Pode escrever com detalhes (ou mandar um áudio) e, se tiver mais de um pedido, diga também qual é. Nossa equipe já vai te responder! 💜';

export const TEXTO_OUTROS = 'Claro, estamos aqui para te ajudar! 😊\n\n'
  + 'Me conta qual é o motivo do seu contato? Pode escrever com detalhes ou mandar um áudio.\n\n'
  + 'Se for sobre um pedido que você já fez, mande também o código do pedido (começa com *NS-*) ou o nome de quem recebeu a música.\n\n'
  + 'Nossa equipe já vai te responder! 💜';

/** Extrai o essencial de um evento messages.upsert da Evolution. Devolve null se não for conversa de cliente. */
// Comando do DONO, digitado na conversa com o cliente: "/musicas" (ou #musicas, /música...).
const COMANDO_MUSICAS = /^\s*[/#!]\s*m[uú]sicas?\s*$/i;

export function lerMensagemEvolution(body) {
  const dados = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const chave = dados?.key;
  if (!chave) return null;
  const textoBruto = dados?.message?.conversation || dados?.message?.extendedTextMessage?.text || '';
  // Mensagem nossa (do celular do ADM ou do próprio robô): só interessa se for o comando do dono.
  const comandoDono = chave.fromMe === true && COMANDO_MUSICAS.test(String(textoBruto));
  if (chave.fromMe === true && !comandoDono) return null;
  const evento = String(body?.event || '').toLowerCase().replace(/_/g, '.');
  if (evento && evento !== 'messages.upsert') return null;

  const jid = String(chave.remoteJid || '');
  if (!jid || /@(g\.us|broadcast|newsletter)$/.test(jid) || jid.startsWith('status@')) return null;

  // Com LID (formato novo do WhatsApp) o telefone real vem em remoteJidAlt / senderPn.
  const comTelefone = [chave.remoteJidAlt, chave.senderPn, jid].find((j) => /@s\.whatsapp\.net$/.test(String(j || '')));
  const telefone = comTelefone ? String(comTelefone).split('@')[0].replace(/\D/g, '') : '';
  const texto = dados.message?.conversation || dados.message?.extendedTextMessage?.text || '';
  return { id: String(chave.id || ''), jid, telefone, texto: String(texto), ...(comandoDono ? { comandoDono: true } : {}) };
}

function nomeDeArquivo(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Dos pedidos do telefone, os arquivos que podem ser enviados: só pedido PAGO e com áudio. */
export function selecionarMusicasPagas(pedidos, max = MAX_ARQUIVOS, todos = pedidos) {
  const arquivos = [];
  for (const p of pedidos || []) {
    if (!p?.id || !pedidoLiberado(p, todos)) continue;
    const faixas = Array.isArray(p.audioFiles) ? p.audioFiles.filter(Boolean) : [];
    const total = faixas.length || (p.audioUrl ? 1 : 0);
    const base = nomeDeArquivo(p.honoreeName) || 'NS-Music';
    for (let i = 0; i < total && arquivos.length < max; i++) {
      const fileName = `Musica-${base}-versao-${i + 1}.mp3`;
      arquivos.push({
        orderId: p.id,
        faixa: i,
        fileName,
        url: `${DOMINIO_CANONICO}/api/audio/proxy?orderId=${encodeURIComponent(p.id)}&faixa=${i}&download=${encodeURIComponent(fileName)}`,
      });
    }
    if (arquivos.length >= max) break;
  }
  return arquivos;
}

async function chamarEvolution(evolution, caminho, { method = 'POST', body, chave, timeoutMs = 20000 } = {}) {
  const res = await fetch(`${evolution.baseUrl}${caminho}`, {
    method,
    headers: { apikey: chave || evolution.apiKey, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, json };
}

export async function enviarTextoAdm(evolution, numero, texto) {
  if (evolution.tipo === 'cloud') return enviarTextoCloud(evolution, numero, texto);
  const r = await chamarEvolution(evolution, `/message/sendText/${evolution.instanceName}`, { body: { number: numero, text: texto } });
  return r.ok;
}

export async function enviarArquivoAdm(evolution, numero, arquivo) {
  // No canal oficial a música só vai como áudio (a Meta não aceita MP3 como documento).
  if (evolution.tipo === 'cloud') return enviarAudioCloud(evolution, numero, arquivo);
  const r = await chamarEvolution(evolution, `/message/sendMedia/${evolution.instanceName}`, {
    body: { number: numero, mediatype: 'document', mimetype: 'audio/mpeg', media: arquivo.url, fileName: arquivo.fileName },
    timeoutMs: 45000,
  });
  return r.ok;
}

/** A mesma música como áudio tocável na conversa (além do MP3 em documento). */
export async function enviarAudioAdm(evolution, numero, arquivo) {
  if (evolution.tipo === 'cloud') return enviarAudioCloud(evolution, numero, arquivo);
  const r = await chamarEvolution(evolution, `/message/sendWhatsAppAudio/${evolution.instanceName}`, {
    body: { number: numero, audio: arquivo.url },
    timeoutMs: 45000,
  });
  return r.ok;
}

/** Apaga para todos a mensagem do comando do dono, para o cliente não ver "/musicas". */
async function apagarComando(evolution, msg) {
  try {
    await chamarEvolution(evolution, `/chat/deleteMessageForEveryone/${evolution.instanceName}`, {
      method: 'DELETE', body: { id: msg.id, remoteJid: msg.jid, fromMe: true }, timeoutMs: 10000,
    });
  } catch (err) {
    console.warn('[whatsapp-adm] Não consegui apagar o comando:', err?.name);
  }
}

// Marca "já tratei" numa chave da tabela config. Devolve true se já havia marca dentro da janela.
async function jaMarcado(supabase, chave, janelaMs) {
  try {
    const { data } = await supabase.from('config').select('valor').eq('chave', chave).maybeSingle();
    const em = data?.valor?.at ? Date.parse(data.valor.at) : NaN;
    if (!Number.isNaN(em) && Date.now() - em < janelaMs) return true;
    await supabase.from('config').upsert({ chave, valor: { at: new Date().toISOString() }, updated_at: new Date().toISOString() });
  } catch (err) {
    console.warn('[whatsapp-adm] Falha na marca de controle:', err?.name);
  }
  return false;
}

const chaveEscolha = (telefone) => `adm_escolha_${telefone}`;

async function lerEscolha(supabase, telefone) {
  try {
    const { data } = await supabase.from('config').select('valor').eq('chave', chaveEscolha(telefone)).maybeSingle();
    const v = data?.valor;
    const em = v?.at ? Date.parse(v.at) : NaN;
    if (Number.isNaN(em) || Date.now() - em > VALIDADE_ESCOLHA_MS || !Array.isArray(v.pedidos) || v.pedidos.length === 0) return null;
    return v.pedidos;
  } catch (err) {
    console.warn('[whatsapp-adm] Falha ao ler a escolha pendente:', err?.name);
    return null;
  }
}

async function gravarEscolha(supabase, telefone, ids) {
  try {
    await supabase.from('config').upsert({ chave: chaveEscolha(telefone), valor: ids ? { at: new Date().toISOString(), pedidos: ids } : { at: null, pedidos: [] }, updated_at: new Date().toISOString() });
  } catch (err) {
    console.warn('[whatsapp-adm] Falha ao gravar a escolha pendente:', err?.name);
  }
}

// Manda os MP3 de um ou mais pedidos, com a mensagem de abertura. Devolve { enviados, total }.
async function enviarPedidos(ctx, destino, pedidos, abertura, todos = pedidos) {
  const arquivos = selecionarMusicasPagas(pedidos, MAX_ARQUIVOS, todos);
  await enviarTextoAdm(ctx.evolution, destino, abertura);
  let enviados = 0;
  let audios = 0;
  const oficial = ctx.evolution.tipo === 'cloud';
  // O trabalho em segundo plano na Cloudflare dura ~30 s depois da resposta: para antes disso em vez
  // de ser cortado no meio de uma música.
  const limiteEm = Date.now() + 22000;
  for (const [i, arquivo] of arquivos.entries()) {
    if (oficial && Date.now() > limiteEm) break;
    if (oficial) {
      // Canal oficial: um áudio por música. Com mais de uma, um rótulo antes diz qual é qual (o áudio
      // não mostra o nome do arquivo), e uma pausa curta mantém a ordem de chegada.
      try {
        if (arquivos.length > 1) {
          await enviarTextoAdm(ctx.evolution, destino, `🎵 Música ${i + 1} de ${arquivos.length}`);
        }
        if (await enviarAudioAdm(ctx.evolution, destino, arquivo)) { enviados++; audios++; }
      } catch (err) {
        console.warn('[whatsapp-adm] Falha ao enviar um áudio:', err?.name);
      }
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    try {
      if (await enviarArquivoAdm(ctx.evolution, destino, arquivo)) enviados++;
    } catch (err) {
      console.warn('[whatsapp-adm] Falha ao enviar um arquivo:', err?.name);
    }
    // Também como áudio, para ouvir direto na conversa.
    try {
      if (await enviarAudioAdm(ctx.evolution, destino, arquivo)) audios++;
    } catch (err) {
      console.warn('[whatsapp-adm] Falha ao enviar um áudio:', err?.name);
    }
  }
  if (oficial && enviados < arquivos.length) {
    await enviarTextoAdm(ctx.evolution, destino, `Mandei ${enviados} de ${arquivos.length} músicas. Para receber as outras, mande *3* de novo daqui a alguns minutos. 😉`);
    return { enviados, audios, total: arquivos.length };
  }
  const faixas = pedidos.reduce((n, p) => n + ((Array.isArray(p.audioFiles) ? p.audioFiles.filter(Boolean).length : 0) || (p.audioUrl ? 1 : 0)), 0);
  if (faixas > arquivos.length) {
    await enviarTextoAdm(ctx.evolution, destino, `Mandei os ${arquivos.length} primeiros arquivos. Para receber os outros, mande *3* de novo daqui a alguns minutos e escolha o pedido pelo número. 😉`);
  }
  return { enviados, audios, total: arquivos.length };
}

async function registrarAcao(ctx, acao) {
  try {
    const ultimasAcoes = [{ em: new Date().toISOString(), ...acao }, ...ctx.config.ultimasAcoes].slice(0, 30);
    ctx.config = { ...ctx.config, ultimasAcoes };
    await salvarAdm(ctx.supabase, ctx.config);
  } catch (err) {
    console.warn('[whatsapp-adm] Falha ao registrar a ação:', err?.name);
  }
}

/**
 * Trata um evento recebido do número ADM. Nunca lança. Devolve { acao } só para log/teste:
 * 'ignorada' | 'duplicada' | 'ajuste' | 'outros' | 'link' | 'lista' | 'musicas' | 'sem_pedido_pago' | 'aguardando' | 'falha'.
 */
export async function tratarMensagemAdm(body, env = {}, ctxPronto = null) {
  try {
    const ctx = ctxPronto || await carregarAdm(env);
    if (!ctx.supabase || !ctx.evolution || !ctx.config.ligada) return { acao: 'ignorada' };

    const msg = body?.cloudMsg || lerMensagemEvolution(body);
    if (!msg) return { acao: 'ignorada' };
    const dono = Boolean(msg.comandoDono);

    // Cliente respondendo à lista de pedidos (vale por 30 minutos)? Tem prioridade sobre o menu.
    const pendente = !dono && msg.telefone ? await lerEscolha(ctx.supabase, msg.telefone) : null;
    const escolha = pendente ? interpretarEscolha(msg.texto, pendente.length) : null;
    const opcao = dono ? '3' : (escolha ? null : interpretarOpcao(msg.texto));
    if (!escolha && !opcao) return { acao: 'ignorada' };

    if (msg.id && await jaMarcado(ctx.supabase, `dedup_msg_adm_${msg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`, 10 * 60 * 1000)) {
      return { acao: 'duplicada' };
    }

    const destino = msg.telefone || msg.jid;
    const final4 = msg.telefone ? msg.telefone.slice(-4) : 'lid';
    const rotulo = dono ? '/musicas' : '3';
    if (dono) await apagarComando(ctx.evolution, msg);

    if (escolha) {
      const pagos = pedidosPagosComAudio(await findOrdersByPhone(msg.telefone, env, 20));
      const porPrincipal = new Map(agruparComBonus(pagos).map((g) => [g.principal.id, g]));
      const lista = pendente.map((id) => porPrincipal.get(id)).filter(Boolean);
      const grupos = escolha === 'todas' ? lista : [lista[escolha - 1]].filter(Boolean);
      const escolhidos = grupos.flatMap((g) => g.pedidos);
      await gravarEscolha(ctx.supabase, msg.telefone, null);
      if (escolhidos.length === 0) {
        await registrarAcao(ctx, { opcao: '3', final: final4, resultado: 'Escolha não encontrada — responda manualmente' });
        return { acao: 'sem_pedido_pago' };
      }
      const abertura = grupos.length === 1
        ? `Perfeito! Aqui está a música do pedido ${descreverGrupo(grupos[0])}, em arquivo MP3 e em áudio 🎵`
        : `Perfeito! Estou te enviando as músicas dos seus ${grupos.length} pedidos aqui mesmo, em arquivo MP3 e em áudio 🎵`;
      const r = await enviarPedidos(ctx, destino, escolhidos, abertura, pagos);
      const qual = escolha === 'todas' ? 'todas' : `nº ${escolha}`;
      await registrarAcao(ctx, { opcao: '3', final: final4, resultado: `Escolheu ${qual}: ${r.enviados} de ${r.total} arquivo(s) e ${r.audios} áudio(s) enviados` });
      return { acao: r.enviados > 0 ? 'musicas' : 'falha', ...r };
    }

    if (opcao === '1' || opcao === '5') {
      const ajuste = opcao === '1';
      if (msg.telefone && await jaMarcado(ctx.supabase, `adm_${ajuste ? 'ajuste' : 'outros'}_${msg.telefone}`, 10 * 60 * 1000)) return { acao: 'aguardando' };
      const ok = await enviarTextoAdm(ctx.evolution, destino, ajuste ? TEXTO_AJUSTE : TEXTO_OUTROS);
      const feito = ajuste ? 'Perguntou o que ajustar — responda a conversa' : 'Perguntou o motivo do contato — responda a conversa';
      await registrarAcao(ctx, { opcao, final: final4, resultado: ok ? feito : 'Falha ao enviar a pergunta' });
      return { acao: ok ? (ajuste ? 'ajuste' : 'outros') : 'falha' };
    }

    if (opcao === '4') {
      const ok = await enviarTextoAdm(ctx.evolution, destino, `Que bom! 🎵 Para criar a sua música é só acessar o link abaixo e contar a história:\n\n${resolveCriarUrl()}`);
      await registrarAcao(ctx, { opcao: '4', final: final4, resultado: ok ? 'Link enviado' : 'Falha ao enviar o link' });
      return { acao: ok ? 'link' : 'falha' };
    }

    // Opção 3: só dá para achar os pedidos com o telefone real em mãos.
    if (!msg.telefone) {
      await registrarAcao(ctx, { opcao: rotulo, final: final4, resultado: 'Telefone não identificado — responda manualmente' });
      return { acao: 'sem_pedido_pago' };
    }
    const pagos = pedidosPagosComAudio(await findOrdersByPhone(msg.telefone, env, 20));
    if (pagos.length === 0) {
      await registrarAcao(ctx, { opcao: rotulo, final: final4, resultado: dono ? 'Comando /musicas: nenhum pedido PAGO neste telefone — confirme o pagamento no painel e mande de novo' : 'Nenhum pedido pago neste telefone — responda manualmente' });
      return { acao: 'sem_pedido_pago' };
    }
    // O comando do dono não espera o intervalo de reenvio.
    if (!dono && await jaMarcado(ctx.supabase, `adm_envio_${msg.telefone}`, INTERVALO_REENVIO_MS)) {
      return { acao: 'aguardando' };
    }

    // Música bônus vai junto com o pedido principal dela (ver agruparComBonus).
    const grupos = agruparComBonus(pagos);
    if (grupos.length > 1) {
      const lista = grupos.slice(0, MAX_LISTA);
      const ok = await enviarTextoAdm(ctx.evolution, destino, textoListaPedidos(lista));
      if (ok) await gravarEscolha(ctx.supabase, msg.telefone, lista.map((g) => g.principal.id));
      await registrarAcao(ctx, { opcao: rotulo, final: final4, resultado: ok ? `Lista com ${lista.length} pedidos enviada — aguardando a escolha` : 'Falha ao enviar a lista' });
      return { acao: ok ? 'lista' : 'falha', total: lista.length };
    }

    const unico = grupos[0];
    const r = await enviarPedidos(ctx, destino, unico.pedidos, `Encontrei o seu pedido ${descreverGrupo(unico)} 🎵\n\nEstou te enviando ${unico.pedidos.length > 1 ? 'as músicas (principal e bônus)' : 'a música'} aqui mesmo, em arquivo MP3 e em áudio:`, pagos);
    await registrarAcao(ctx, { opcao: rotulo, final: final4, resultado: `${r.enviados} de ${r.total} arquivo(s) e ${r.audios} áudio(s) enviados` });
    return { acao: r.enviados > 0 ? 'musicas' : 'falha', ...r };
  } catch (err) {
    console.warn('[whatsapp-adm] Erro ao tratar mensagem:', err?.name);
    return { acao: 'falha' };
  }
}

// ---------- Conexão da instância (usado pelo painel) ----------

export async function estadoDaConexao(evolution) {
  if (evolution.tipo === 'cloud') return estadoCloud(evolution);
  try {
    const r = await chamarEvolution(evolution, `/instance/connectionState/${evolution.instanceName}`, { method: 'GET', timeoutMs: 10000 });
    if (r.status === 404) return 'inexistente';
    if (!r.ok) return 'erro';
    return String(r.json?.instance?.state || r.json?.state || 'desconhecido');
  } catch (err) {
    return 'erro';
  }
}

/** Cria a instância (se faltar), aponta o webhook para o site e devolve o QR code para escanear. */
export async function conectarInstancia(ctx, webhookUrl) {
  const evo = ctx.evolution;
  if (evo.tipo === 'cloud') {
    return { ok: false, erro: 'O ADM está no canal oficial da Meta: não usa QR code. A conexão é feita no painel da Meta (WhatsApp Manager).' };
  }
  let estado = await estadoDaConexao(evo);
  let qr = null;

  if (estado === 'inexistente') {
    const criada = await chamarEvolution(evo, '/instance/create', {
      chave: evo.chaveGlobal,
      body: { instanceName: evo.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true },
    });
    if (!criada.ok) {
      return { ok: false, erro: criada.status === 401 || criada.status === 403
        ? 'A chave da Evolution salva no site não tem permissão para criar instâncias. Crie a instância manualmente no painel da Evolution com o nome indicado abaixo.'
        : `A Evolution recusou a criação da instância (HTTP ${criada.status}).` };
    }
    const token = typeof criada.json?.hash === 'string' ? criada.json.hash : criada.json?.hash?.apikey;
    if (token) {
      ctx.config = { ...ctx.config, apiKey: token };
      await salvarAdm(ctx.supabase, ctx.config);
      evo.apiKey = token;
    }
    qr = criada.json?.qrcode?.base64 || null;
    estado = 'connecting';
  }

  // Webhook: formato da Evolution v2 e, se recusado, o formato antigo.
  const eventos = ['MESSAGES_UPSERT'];
  let wh = await chamarEvolution(evo, `/webhook/set/${evo.instanceName}`, {
    body: { webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events: eventos } },
  });
  if (!wh.ok) {
    wh = await chamarEvolution(evo, `/webhook/set/${evo.instanceName}`, {
      body: { enabled: true, url: webhookUrl, webhook_by_events: false, webhook_base64: false, events: eventos },
    });
  }

  if (estado !== 'open' && !qr) {
    const con = await chamarEvolution(evo, `/instance/connect/${evo.instanceName}`, { method: 'GET' });
    qr = con.json?.base64 || con.json?.qrcode?.base64 || null;
  }
  return { ok: true, estado, qr, webhookOk: wh.ok };
}
