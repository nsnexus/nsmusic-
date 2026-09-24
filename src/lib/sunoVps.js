// Cliente da API de Suno própria (VPS do estúdio), adicionada em 24/09/2026 como provedor PRIMÁRIO
// de geração de música. A Kie.ai continua inteira, como fallback — ver src/lib/suno.js.
//
// Diferenças que importam em relação à Kie.ai, e que explicam o formato deste módulo:
//
//   - Não existe "taskId": a API responde com os DOIS clipes que a Suno sempre gera, cada um com
//     seu `id`. Adotamos o id do primeiro clipe como taskId lógico do pedido (é o que vai para
//     `suno_tasks/{id}` e para `orders.sunoTaskId`), e guardamos os dois ids em `clipIds`.
//   - O webhook chega UMA VEZ POR CLIPE. Gravar o pedido no primeiro que chegar deixaria o cliente
//     com uma única versão, e o segundo callback sobrescreveria o campo — por isso quem recebe
//     (api/suno/webhook-vps) reconsulta os dois ids aqui antes de fechar o pedido.
//   - O áudio é servido por cdn1.suno.ai, já presente na allowlist dos proxies de mídia.
//
// Nenhum segredo tem valor padrão embutido: sem SUNO_VPS_URL e SUNO_VPS_API_KEY, este provedor
// simplesmente se declara indisponível e a geração vai para a Kie.ai (regra 1 do CLAUDE.md).

import { readEnvValue } from './envValue.js';

const TIMEOUT_GERACAO_MS = 20000;
const TIMEOUT_CONSULTA_MS = 10000;

// Modelo da Suno usado na VPS. v6 é o flagship; a API aceita v6-mini, v4 e v3.5.
const MODELO_PADRAO = 'v6';

export function lerConfigVps(env) {
  const baseUrl = readEnvValue(env, 'SUNO_VPS_URL').replace(/\/+$/, '');
  const apiKey = readEnvValue(env, 'SUNO_VPS_API_KEY');
  return { baseUrl, apiKey, configurado: Boolean(baseUrl && apiKey) };
}

// A VPS aceita chamada em http:// (porta 3000) além do domínio com TLS. Recusamos http: a
// `x-api-key` viaja em toda geração, e em texto claro ela vale para quem estiver no caminho.
export function configVpsUtilizavel(config) {
  return config.configurado && config.baseUrl.startsWith('https://');
}

function cabecalhos(apiKey) {
  return { 'Content-Type': 'application/json', 'x-api-key': apiKey };
}

/**
 * Dispara a geração na VPS. Devolve sempre um objeto — nunca lança — para o chamador decidir se cai
 * no fallback. `definitivo: true` significa "não adianta insistir neste provedor" (crédito acabado,
 * chave recusada, payload rejeitado); é o sinal que manda a geração para a Kie.ai na hora.
 *
 * @returns {Promise<{ok: true, taskId: string, clipIds: string[]} | {ok: false, erro: string, definitivo: boolean, status: number|null}>}
 */
export async function gerarNaVps({ prompt, tags, title, callbackUrl, instrumental = false }, env) {
  const config = lerConfigVps(env);
  if (!configVpsUtilizavel(config)) {
    return { ok: false, erro: 'SUNO_VPS_URL/SUNO_VPS_API_KEY ausentes ou sem https', definitivo: true, status: null };
  }

  let resposta, corpo;
  try {
    resposta = await fetch(`${config.baseUrl}/api/custom_generate`, {
      method: 'POST',
      headers: cabecalhos(config.apiKey),
      body: JSON.stringify({
        title: String(title || 'Homenagem NSMusic').substring(0, 80),
        tags,
        prompt,
        make_instrumental: Boolean(instrumental),
        mv: MODELO_PADRAO,
        ...(callbackUrl ? { callBackUrl: callbackUrl } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_GERACAO_MS),
    });
    corpo = await resposta.json().catch(() => ({}));
  } catch (err) {
    // Rede/timeout: transitório do ponto de vista do provedor, mas para o cliente que está
    // esperando não dá para insistir — quem chama decide, e hoje decide cair na Kie.ai.
    return { ok: false, erro: `${err.name}: ${err.message}`, definitivo: false, status: null };
  }

  // Crédito da conta Suno esgotado: a VPS responde 402 com code INSUFFICIENT_CREDITS. É o sinal
  // que manda a geração para a Kie.ai na hora, sem esperar timeout. Com 2.500 créditos/mês (10 por
  // geração) contra o volume atual do estúdio, este caminho é rotina, não exceção — por isso ele
  // tem nome próprio no retorno e vira aviso claro no log, nunca erro para o cliente.
  if (resposta.status === 402 || corpo?.code === 'INSUFFICIENT_CREDITS') {
    return { ok: false, erro: 'creditos_suno_esgotados', semCredito: true, definitivo: true, status: 402 };
  }

  const clipes = Array.isArray(corpo?.clips) ? corpo.clips : [];
  const clipIds = clipes.map((c) => c?.id).filter((id) => typeof id === 'string' && id);

  if (!resposta.ok || corpo?.ok === false || clipIds.length === 0) {
    const motivo = String(corpo?.error || corpo?.message || `http_${resposta.status}`);
    return {
      ok: false,
      erro: motivo,
      // 5xx é problema momentâneo da VPS; o resto (401, 4xx, resposta sem clipe) é definitivo.
      definitivo: resposta.status < 500,
      status: resposta.status,
    };
  }

  return { ok: true, taskId: clipIds[0], clipIds };
}

/**
 * Consulta os clipes na VPS. Devolve a lista crua da API (já no formato que
 * src/lib/db.js:extractAudioTracks entende: `{ id, audio_url, image_url, ... }`).
 *
 * @returns {Promise<{ok: true, clipes: object[]} | {ok: false, erro: string}>}
 */
export async function consultarClipesVps(clipIds, env) {
  const ids = (Array.isArray(clipIds) ? clipIds : [clipIds]).filter(Boolean);
  if (ids.length === 0) return { ok: false, erro: 'nenhum clipId informado' };

  const config = lerConfigVps(env);
  if (!configVpsUtilizavel(config)) return { ok: false, erro: 'VPS não configurada' };

  try {
    const r = await fetch(`${config.baseUrl}/api/get?ids=${encodeURIComponent(ids.join(','))}`, {
      headers: cabecalhos(config.apiKey),
      signal: AbortSignal.timeout(TIMEOUT_CONSULTA_MS),
    });
    if (!r.ok) return { ok: false, erro: `http_${r.status}` };
    const corpo = await r.json().catch(() => null);
    const clipes = Array.isArray(corpo) ? corpo : (Array.isArray(corpo?.clips) ? corpo.clips : []);
    return { ok: true, clipes };
  } catch (err) {
    return { ok: false, erro: `${err.name}: ${err.message}` };
  }
}

/**
 * Saldo da conta Suno por trás da VPS (GET /api/status). Fora do caminho do cliente de propósito:
 * a consulta custa ~1s, e conferir antes de cada geração atrasaria todo mundo para evitar um 402
 * que já é instantâneo. Serve ao painel admin e a quem quiser avisar antes de acabar.
 *
 * @returns {Promise<{ok: true, creditos: number, plano: string, renovaEm: string|null} | {ok: false, erro: string}>}
 */
export async function consultarSaldoVps(env) {
  const config = lerConfigVps(env);
  if (!configVpsUtilizavel(config)) return { ok: false, erro: 'VPS não configurada' };

  try {
    const r = await fetch(`${config.baseUrl}/api/status`, {
      headers: cabecalhos(config.apiKey),
      signal: AbortSignal.timeout(TIMEOUT_CONSULTA_MS),
    });
    if (!r.ok) return { ok: false, erro: `http_${r.status}` };
    const corpo = await r.json().catch(() => ({}));
    return {
      ok: true,
      creditos: Number(corpo?.credits_left ?? 0),
      plano: String(corpo?.plan || ''),
      renovaEm: corpo?.period_end || null,
    };
  } catch (err) {
    return { ok: false, erro: `${err.name}: ${err.message}` };
  }
}

// Status da Suno: submitted -> queued -> streaming -> complete (ou error).
export function clipePronto(clipe) {
  const status = String(clipe?.status || '').toLowerCase();
  return status === 'complete' && Boolean(clipe?.audio_url);
}

export function clipeFalhou(clipe) {
  return String(clipe?.status || '').toLowerCase() === 'error';
}

/**
 * Decide o que fazer com o conjunto de clipes de um pedido.
 *
 * `fechar` só é true quando não há mais nada por vir: ou todos prontos, ou os que faltam já
 * falharam. Fechar com um clipe pronto e outro ainda em `streaming` entregaria ao cliente uma única
 * versão — ele pagou por duas.
 */
export function avaliarClipes(clipes, totalEsperado) {
  const lista = Array.isArray(clipes) ? clipes : [];
  const prontos = lista.filter(clipePronto);
  const falhados = lista.filter(clipeFalhou);
  const resolvidos = prontos.length + falhados.length;

  return {
    prontos,
    totalPronto: prontos.length,
    totalFalhou: falhados.length,
    fechar: prontos.length > 0 && resolvidos >= totalEsperado,
    tudoFalhou: prontos.length === 0 && falhados.length >= totalEsperado,
  };
}
