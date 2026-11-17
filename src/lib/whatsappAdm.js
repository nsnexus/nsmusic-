// Automação do número ADM (o WhatsApp de atendimento, separado do número que dispara as mensagens
// automáticas). Ele já tem um menu de boas-vindas do próprio WhatsApp Business; aqui tratamos só
// duas respostas:
//   "3" (não consigo baixar)  → manda os MP3 pagos daquele telefone como arquivo, na conversa;
//   "4" (quero criar)         → manda o link da plataforma.
// Qualquer outra mensagem fica em silêncio: é o dono quem responde.
//
// O número ADM é uma SEGUNDA instância na mesma Evolution API. A configuração mora na tabela
// `config` (chave `whatsapp_adm`); endereço e chave da Evolution vêm da configuração principal.

import { getSupabaseEdge } from './supabase-edge.js';
import { getEvolutionConfig } from './whatsapp.js';
import { resolveCriarUrl } from './whatsappTemplates.js';
import { findOrdersByPhone } from './orderLookup.js';
import { DOMINIO_CANONICO } from './siteUrl.js';

export const CHAVE_ADM = 'whatsapp_adm';
export const INSTANCIA_PADRAO = 'nsmusic-adm';
const MAX_ARQUIVOS = 6;
const INTERVALO_REENVIO_MS = 5 * 60 * 1000;
const STATUS_PAGO = new Set(['PAGAMENTO_APROVADO', 'PAGO']);

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

/** "3", " 3 ", "3.", "3️⃣" → '3'. Qualquer coisa além de um 3 ou 4 sozinho → null. */
export function interpretarOpcao(texto) {
  const limpo = String(texto || '').replace(/[️⃣]/g, '').trim().replace(/[.)!\s]+$/, '');
  return limpo === '3' || limpo === '4' ? limpo : null;
}

/** Extrai o essencial de um evento messages.upsert da Evolution. Devolve null se não for conversa de cliente. */
export function lerMensagemEvolution(body) {
  const dados = Array.isArray(body?.data) ? body.data[0] : body?.data;
  const chave = dados?.key;
  if (!chave || chave.fromMe === true) return null;
  const evento = String(body?.event || '').toLowerCase().replace(/_/g, '.');
  if (evento && evento !== 'messages.upsert') return null;

  const jid = String(chave.remoteJid || '');
  if (!jid || /@(g\.us|broadcast|newsletter)$/.test(jid) || jid.startsWith('status@')) return null;

  // Com LID (formato novo do WhatsApp) o telefone real vem em remoteJidAlt / senderPn.
  const comTelefone = [chave.remoteJidAlt, chave.senderPn, jid].find((j) => /@s\.whatsapp\.net$/.test(String(j || '')));
  const telefone = comTelefone ? String(comTelefone).split('@')[0].replace(/\D/g, '') : '';
  const texto = dados.message?.conversation || dados.message?.extendedTextMessage?.text || '';
  return { id: String(chave.id || ''), jid, telefone, texto: String(texto) };
}

function nomeDeArquivo(texto) {
  return String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

/** Dos pedidos do telefone, os arquivos que podem ser enviados: só pedido PAGO e com áudio. */
export function selecionarMusicasPagas(pedidos, max = MAX_ARQUIVOS) {
  const arquivos = [];
  for (const p of pedidos || []) {
    if (!p?.id || !STATUS_PAGO.has(String(p.paymentStatus || ''))) continue;
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
  const r = await chamarEvolution(evolution, `/message/sendText/${evolution.instanceName}`, { body: { number: numero, text: texto } });
  return r.ok;
}

export async function enviarArquivoAdm(evolution, numero, arquivo) {
  const r = await chamarEvolution(evolution, `/message/sendMedia/${evolution.instanceName}`, {
    body: { number: numero, mediatype: 'document', mimetype: 'audio/mpeg', media: arquivo.url, fileName: arquivo.fileName },
    timeoutMs: 45000,
  });
  return r.ok;
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
 * 'ignorada' | 'duplicada' | 'link' | 'musicas' | 'sem_pedido_pago' | 'aguardando' | 'falha'.
 */
export async function tratarMensagemAdm(body, env = {}, ctxPronto = null) {
  try {
    const ctx = ctxPronto || await carregarAdm(env);
    if (!ctx.supabase || !ctx.evolution || !ctx.config.ligada) return { acao: 'ignorada' };

    const msg = lerMensagemEvolution(body);
    const opcao = msg ? interpretarOpcao(msg.texto) : null;
    if (!opcao) return { acao: 'ignorada' };

    if (msg.id && await jaMarcado(ctx.supabase, `dedup_msg_adm_${msg.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)}`, 10 * 60 * 1000)) {
      return { acao: 'duplicada' };
    }

    const destino = msg.telefone || msg.jid;
    const final4 = msg.telefone ? msg.telefone.slice(-4) : 'lid';

    if (opcao === '4') {
      const ok = await enviarTextoAdm(ctx.evolution, destino, `Que bom! 🎵 Para criar a sua música é só acessar o link abaixo e contar a história:\n\n${resolveCriarUrl()}`);
      await registrarAcao(ctx, { opcao: '4', final: final4, resultado: ok ? 'Link enviado' : 'Falha ao enviar o link' });
      return { acao: ok ? 'link' : 'falha' };
    }

    // Opção 3: só dá para achar os pedidos com o telefone real em mãos.
    if (!msg.telefone) {
      await registrarAcao(ctx, { opcao: '3', final: final4, resultado: 'Telefone não identificado — responda manualmente' });
      return { acao: 'sem_pedido_pago' };
    }
    const arquivos = selecionarMusicasPagas(await findOrdersByPhone(msg.telefone, env, 10));
    if (arquivos.length === 0) {
      await registrarAcao(ctx, { opcao: '3', final: final4, resultado: 'Nenhum pedido pago neste telefone — responda manualmente' });
      return { acao: 'sem_pedido_pago' };
    }
    if (await jaMarcado(ctx.supabase, `adm_envio_${msg.telefone}`, INTERVALO_REENVIO_MS)) {
      return { acao: 'aguardando' };
    }

    await enviarTextoAdm(ctx.evolution, destino, `Sem problema! Estou te enviando ${arquivos.length === 1 ? 'a sua música' : `as suas ${arquivos.length} músicas`} aqui mesmo, como arquivo. 🎵`);
    let enviados = 0;
    for (const arquivo of arquivos) {
      try {
        if (await enviarArquivoAdm(ctx.evolution, destino, arquivo)) enviados++;
      } catch (err) {
        console.warn('[whatsapp-adm] Falha ao enviar um arquivo:', err?.name);
      }
    }
    await registrarAcao(ctx, { opcao: '3', final: final4, resultado: `${enviados} de ${arquivos.length} arquivo(s) enviados` });
    return { acao: enviados > 0 ? 'musicas' : 'falha', enviados, total: arquivos.length };
  } catch (err) {
    console.warn('[whatsapp-adm] Erro ao tratar mensagem:', err?.name);
    return { acao: 'falha' };
  }
}

// ---------- Conexão da instância (usado pelo painel) ----------

export async function estadoDaConexao(evolution) {
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
