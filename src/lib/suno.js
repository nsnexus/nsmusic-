// Chamada à Kie.ai para iniciar uma geração de música, mais a retentativa automática quando ela
// reporta falha definitiva. Extraído de api/suno/generate/route.js para ser reaproveitado em três
// pontos que precisam do mesmo comportamento: a rota que o cliente chama na hora de criar, o polling
// de status (retry em tempo real, enquanto o cliente ainda está na página) e a reconciliação por
// cron (retry para quem já fechou a aba) — ver docs/CODEBASE_MAP.md.
//
// Import de firebase/firestore/lite é seguro aqui: este módulo só é usado a partir de rotas Edge.

import { doc, getDoc, updateDoc, increment } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { saveTask, getTask } from './db.js';
import { buildSunoPayload } from './sunoPayload.js';
import { resolverSiteUrl } from './siteUrl.js';
import { readEnvValue } from './envValue.js';
import { gerarNaVps, lerConfigVps, configVpsUtilizavel } from './sunoVps.js';

// Provedores de geração. A VPS própria do estúdio (src/lib/sunoVps.js) entrou em 24/09/2026 como
// primária; a Kie.ai continua inteira como fallback. MUSIC_PROVIDER_PRIMARY inverte a ordem sem
// deploy — é a alavanca para quando um dos dois cair de madrugada.
export const PROVIDER_VPS = 'suno_vps';
export const PROVIDER_KIE = 'kie';

export function provedorPrimario(env) {
  const escolhido = readEnvValue(env, 'MUSIC_PROVIDER_PRIMARY').toLowerCase();
  if (escolhido === PROVIDER_KIE) return PROVIDER_KIE;
  if (escolhido === PROVIDER_VPS) return PROVIDER_VPS;
  // Sem configuração explícita: usa a VPS quando ela estiver configurada, senão Kie.ai.
  return configVpsUtilizavel(lerConfigVps(env)) ? PROVIDER_VPS : PROVIDER_KIE;
}

// A Kie.ai sinaliza a maioria dos erros com HTTP 200 e um `code` no corpo (429/430 = limite de
// taxa, 455 = manutenção, 500 = erro interno deles) — só olhar response.status não pegava esses
// casos e o retry abaixo nunca rodava para o modo de falha mais comum da API.
const TRANSIENT_KIE_CODES = new Set([429, 430, 455, 500, 501, 503]);
export function isTransientKieFailure(status, code) {
  if (status >= 500 || status === 429) return true;
  return code != null && TRANSIENT_KIE_CODES.has(Number(code));
}

// Tentativas automáticas de RETRY depois que a Kie.ai já reportou falha definitiva para uma tarefa
// (não confundir com as 3 tentativas de rede dentro de requestSunoGeneration, que cobrem timeout e
// erro transitório de UMA chamada). Cap baixo de propósito: uma letra/estilo rejeitado por política
// de conteúdo falha de forma idêntica em toda tentativa — sem limite, ficaria retentando pra sempre
// e queimando crédito à toa. Esgotado o limite, o pedido fica para reprocessamento manual no painel.
const MAX_AUTO_RETRIES = 3;

// Fidelidade ao estilo pedido pelo cliente — ver comentário no corpo da chamada, requestSunoGeneration.
// Valores altos de estilo + baixos de estranheza favorecem o pedido do cliente sobre a "criatividade"
// da IA; ajuste aqui se o resultado ficar genérico/repetitivo demais pro gosto do estúdio.
const STYLE_WEIGHT = 0.75;
const WEIRDNESS_CONSTRAINT = 0.2;
// Pages encerra a requisição antes de completar a antiga combinação de 3 timeouts de 15 s.
// Duas tentativas de 10 s ainda cobrem uma oscilação transitória da Kie.ai e deixam margem para
// Firestore e serialização da resposta JSON voltarem ao cliente.
const MAX_KIE_ATTEMPTS = 2;
const KIE_REQUEST_TIMEOUT_MS = 10000;

// Reexportado de ./envValue.js — vários módulos já importavam daqui antes da extração.
export { readEnvValue };

// Grava no pedido que a geração falhou, para o admin ver o motivo e reprocessar em lote — sem isso
// o pedido só fica preso em EM_PRODUCAO/LETRA_CRIADA/GERANDO_AUDIO sem nenhum rastro do que aconteceu.
export async function recordSunoFailure(orderId, reason) {
  if (!orderId) return;
  try {
    await updateDoc(doc(db, 'orders', orderId), {
      sunoError: reason,
      sunoErrorAt: new Date().toISOString(),
      sunoErrorCount: increment(1),
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[suno] Erro ao registrar falha de geração no pedido:', err.message);
  }
}

/**
 * Inicia a geração da música no provedor primário e, se ele falhar, no outro. Persiste o vínculo
 * taskId->orderId e qual provedor atendeu — sem esse registro, nem o webhook nem o polling nem o
 * arquivamento sabem para onde olhar depois.
 *
 * Não decide política de quantas vezes retentar depois de uma falha definitiva dos DOIS provedores;
 * isso é de quem chama (a rota, no clique manual; maybeAutoRetrySunoFailure, no automático).
 *
 * @param {{orderId: string, prompt: string, tags: string, title?: string}} params
 * @param {object} env
 * @returns {Promise<{ok: true, taskId: string, provider: string} | {ok: false, error: string, status: number}>}
 */
export async function requestSunoGeneration({ orderId, prompt, tags, title }, env) {
  const primario = provedorPrimario(env);

  if (primario === PROVIDER_VPS) {
    const viaVps = await gerarPelaVps({ orderId, prompt, tags, title }, env);
    if (viaVps.ok) return viaVps;
    // Fallback: a Kie.ai é a rede de segurança. Um pedido não pode morrer porque a VPS ficou sem
    // crédito ou saiu do ar — o cliente já está na tela esperando a música.
    //
    // Sem crédito é o caminho ESPERADO, não uma anomalia: o plano Pro da conta Suno dá 2.500
    // créditos por mês (10 por geração) e o estúdio gera bem mais que isso. A VPS é a economia
    // enquanto dura; a Kie.ai é quem garante o mês inteiro.
    console.warn(
      viaVps.semCredito
        ? '[suno] Créditos da VPS esgotados — geração indo para a Kie.ai.'
        : `[suno] VPS falhou, caindo para a Kie.ai: ${viaVps.error}`
    );
  }

  const viaKie = await gerarPelaKie({ orderId, prompt, tags }, env);
  if (viaKie.ok || primario === PROVIDER_VPS) return viaKie;

  // Primário era a Kie.ai e ela falhou: tenta a VPS antes de desistir.
  const viaVps = await gerarPelaVps({ orderId, prompt, tags, title }, env);
  return viaVps.ok ? viaVps : viaKie;
}

/**
 * Geração na VPS própria (src/lib/sunoVps.js). A resposta traz os dois clipes de uma vez; o id do
 * primeiro vira o taskId lógico do pedido.
 */
async function gerarPelaVps({ orderId, prompt, tags, title }, env) {
  const baseUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));
  const webhookSecret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');

  // O callback precisa ser montado ANTES da chamada, quando ainda não existe taskId — por isso
  // leva o orderId, e não o taskId. orderId não é dado pessoal (ver .claude/rules/security.md), e o
  // webhook confere o segredo antes de qualquer escrita. Sem orderId não há para onde gravar o
  // resultado, então nesse caso a geração fica só no polling.
  const callbackUrl = orderId && webhookSecret
    ? `${baseUrl}/api/suno/webhook-vps?secret=${encodeURIComponent(webhookSecret)}&orderId=${encodeURIComponent(orderId)}`
    : '';

  const resultado = await gerarNaVps({ prompt, tags, title, callbackUrl }, env);
  if (!resultado.ok) {
    return { ok: false, error: resultado.erro, status: resultado.status || 502, semCredito: Boolean(resultado.semCredito) };
  }

  const persistido = await persistirGeracao({
    orderId,
    taskId: resultado.taskId,
    provider: PROVIDER_VPS,
    clipIds: resultado.clipIds,
  });
  if (!persistido.ok) return persistido;

  return { ok: true, taskId: resultado.taskId, provider: PROVIDER_VPS };
}

/**
 * Grava o vínculo tarefa->pedido das duas pontas (suno_tasks e orders). Comum aos dois provedores:
 * o resto do sistema (webhook, polling, reconciliação, arquivamento, add-on de playback) lê sempre
 * daqui, nunca do provedor.
 */
async function persistirGeracao({ orderId, taskId, provider, clipIds = [] }) {
  const salvo = await saveTask(taskId, 'PROCESSING', null, orderId, { provider, clipIds });
  if (!salvo) {
    await recordSunoFailure(orderId, 'save_task_failed');
    return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
  }

  if (orderId) {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        productionStatus: 'GERANDO_AUDIO',
        sunoRequestedAt: new Date().toISOString(),
        sunoError: null,
        sunoTaskId: taskId,
        sunoProvider: provider,
        // Só a VPS usa: os dois clipes que o webhook precisa reconsultar antes de fechar o pedido.
        ...(clipIds.length > 0 ? { sunoClipIds: clipIds } : {}),
        sunoGenerationCount: increment(1),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[suno] Erro ao atualizar status do pedido para GERANDO_AUDIO:', err.message);
      await recordSunoFailure(orderId, 'order_update_failed');
      return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
    }
  }

  return { ok: true };
}

async function gerarPelaKie({ orderId, prompt, tags }, env) {
  const apiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!apiKey) {
    console.error('[suno] Variável de ambiente KIE_API_KEY não configurada.');
    return { ok: false, error: 'Configuração ausente: KIE_API_KEY não definida no servidor.', status: 500 };
  }

  // Garante a URL do webhook no domínio oficial de produção (ver src/lib/siteUrl.js).
  const baseUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));

  // Segredo compartilhado no callback: /api/suno/webhook confere este valor antes de processar
  // (ver A-03 no AUDIT_REPORT.md — o webhook não tinha nenhuma autenticação).
  const webhookSecret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
  const callbackUrl = webhookSecret
    ? `${baseUrl}/api/suno/webhook?secret=${encodeURIComponent(webhookSecret)}`
    : `${baseUrl}/api/suno/webhook`;

  // Uma tentativa extra para erros transitórios (timeout, falha de rede, 5xx). Erros
  // definitivos (4xx, ex: payload ou chave inválida) não são reexecutados. Cada tentativa cria
  // seu PRÓPRIO AbortSignal.timeout — reaproveitar o mesmo sinal entre tentativas faria as
  // tentativas seguintes abortarem na hora, já que o relógio do sinal conta a partir da criação.
  let response, data;
  for (let attempt = 1; attempt <= MAX_KIE_ATTEMPTS; attempt++) {
    try {
      response = await fetch('https://api.kie.ai/api/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          prompt: prompt,
          customMode: true,
          instrumental: false,
          model: 'V5_5',
          style: tags,
          title: `Pedido ${orderId ? orderId.substring(0, 8) : 'Novo'}`.substring(0, 80),
          callBackUrl: callbackUrl,
          // Sem esses dois campos, a Kie.ai decide sozinha (default não documentado) — explica cliente
          // pedir um estilo e a música sair "torta" (achado 28/08/2026). styleWeight alto = mais fiel
          // ao estilo pedido; weirdnessConstraint baixo = MENOS desvio criativo (documentação da
          // Kie.ai: valor alto em weirdnessConstraint é mais estranho/experimental, não o contrário).
          styleWeight: STYLE_WEIGHT,
          weirdnessConstraint: WEIRDNESS_CONSTRAINT,
        }),
        signal: AbortSignal.timeout(KIE_REQUEST_TIMEOUT_MS)
      });

      data = await response.json().catch(() => ({}));

      if (response.ok && (!data.code || data.code === 200)) break;

      if (!isTransientKieFailure(response.status, data.code)) break;
      console.warn(`[suno] Erro transitório da Kie.ai (tentativa ${attempt}/${MAX_KIE_ATTEMPTS}):`, response.status, data.code);
    } catch (fetchErr) {
      console.warn(`[suno] Falha de rede ao chamar Kie.ai (tentativa ${attempt}/${MAX_KIE_ATTEMPTS}):`, fetchErr.message);
      response = null;
      data = { msg: fetchErr.message };
    }
    if (attempt < MAX_KIE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  // Mensagem ao cliente nunca ecoa o texto bruto do provedor externo (ver .claude/rules/security.md)
  // — o motivo detalhado fica só no log do servidor e no campo sunoError do pedido, para o admin.
  if (!response || !response.ok || (data.code && data.code !== 200)) {
    console.error('[suno] Erro no retorno da Kie.ai:', response?.status, data?.code, data?.msg || data?.message);
    await recordSunoFailure(orderId, `kie_${data?.code || response?.status || 'network'}`);
    return { ok: false, error: 'Não foi possível iniciar a geração da música agora. Tente novamente em instantes.', status: 502 };
  }

  const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id || data?.id;
  if (!taskId) {
    console.error('[suno] Kie.ai não retornou um taskId válido:', data);
    await recordSunoFailure(orderId, 'kie_no_taskid');
    return { ok: false, error: 'A geração da música não pôde ser confirmada. Tente novamente em instantes.', status: 502 };
  }

  // sunoTaskId guardado aqui também permite a separação vocal do add-on de playback: a Kie.ai
  // identifica a faixa por taskId+audioId da geração original (ver src/lib/playback.js).
  // sunoGenerationCount conta cada chamada que o provedor de fato aceitou (e portanto cobrou),
  // para o painel admin estimar gasto; increment() sobrevive a retentativas concorrentes.
  const persistido = await persistirGeracao({ orderId, taskId, provider: PROVIDER_KIE });
  if (!persistido.ok) return persistido;

  return { ok: true, taskId, provider: PROVIDER_KIE };
}

// Segue a cadeia de retentativas automáticas até a tarefa mais recente. Uma tarefa que falhou e foi
// automaticamente reenviada (ver maybeAutoRetrySunoFailure) grava o novo taskId em
// suno_tasks/{taskId}.retryTaskId — isso permite que quem já estava consultando o taskId ANTIGO
// (o navegador do cliente, fazendo polling; ou suno_tasks encontrado via orderId pela reconciliação)
// acabe olhando para o resultado certo sem precisar saber que uma nova tarefa foi criada.
//
// Limitado a poucos saltos: o cap de MAX_AUTO_RETRIES já impede cadeias longas de acontecer de
// verdade; o limite aqui é só para nunca entrar em loop se algum bug de auto-referência escapar.
export async function resolveLatestTaskId(taskId) {
  let current = taskId;
  for (let hop = 0; hop < MAX_AUTO_RETRIES + 1; hop++) {
    const task = await getTask(current);
    if (task?.retryTaskId) {
      current = task.retryTaskId;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Reage a uma falha definitiva reportada pela Kie.ai para `taskId`, retentando automaticamente
 * quando ainda há orçamento de tentativas e dados suficientes no pedido para remontar o pedido à
 * Kie.ai (letra/estilo/humor/tipo de voz).
 *
 * Idempotente por reserva sequencial (getDoc + updateDoc, o mesmo padrão usado em
 * src/lib/payments.js — runTransaction não existe em firebase/firestore/lite): o polling do cliente
 * e a reconciliação por cron podem colidir na mesma tarefa falha, e sem essa reserva as duas
 * disparariam uma retentativa cada, duplicando o gasto com a Kie.ai.
 *
 * @param {{taskId: string, orderId: string, env: object, reason: string}} params
 * @returns {Promise<{retried: true, newTaskId: string} | {retried: false, reason: string}>}
 */
export async function maybeAutoRetrySunoFailure({ taskId, orderId, env, reason }) {
  if (!orderId) return { retried: false, reason: 'sem_order_id' };

  const orderRef = doc(db, 'orders', orderId);
  let orderData;
  try {
    const snap = await getDoc(orderRef);
    if (!snap.exists()) return { retried: false, reason: 'pedido_nao_encontrado' };
    orderData = snap.data();
  } catch (err) {
    console.warn('[suno] Falha ao ler pedido para decidir retentativa:', err.message);
    return { retried: false, reason: 'falha_leitura_pedido' };
  }

  // Já convergiu por outra via (webhook chegou, ou outra chamada já resolveu) — nada a fazer.
  if (orderData.productionStatus !== 'GERANDO_AUDIO') {
    return { retried: false, reason: 'ja_resolvido' };
  }

  const retriesUsados = Number(orderData.sunoAutoRetryCount) || 0;
  if (retriesUsados >= MAX_AUTO_RETRIES) {
    await recordSunoFailure(orderId, `kie_falhou_${reason}_limite_retry_esgotado`);
    return { retried: false, reason: 'limite_esgotado' };
  }

  // Reserva sequencial: evita que polling do cliente e cron de reconciliação disparem duas
  // retentativas para a mesma falha ao colidir na mesma janela de tempo.
  try {
    const freshSnap = await getDoc(orderRef);
    const freshData = freshSnap.exists() ? freshSnap.data() : null;
    if (!freshData || freshData.sunoRetryReserved || freshData.productionStatus !== 'GERANDO_AUDIO') {
      return { retried: false, reason: 'reservado_por_outra_chamada' };
    }
    await updateDoc(orderRef, { sunoRetryReserved: true, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.warn('[suno] Falha ao reservar retentativa automática:', err.message);
    return { retried: false, reason: 'falha_reserva' };
  }

  const payload = buildSunoPayload(orderData);
  if (!payload.prompt?.trim() || !payload.tags?.trim()) {
    await updateDoc(orderRef, { sunoRetryReserved: false, updatedAt: new Date().toISOString() }).catch(() => {});
    await recordSunoFailure(orderId, `kie_falhou_${reason}_sem_dados_para_retry`);
    return { retried: false, reason: 'payload_incompleto' };
  }

  const result = await requestSunoGeneration({ orderId, prompt: payload.prompt, tags: payload.tags }, env);

  if (!result.ok) {
    await updateDoc(orderRef, { sunoRetryReserved: false, updatedAt: new Date().toISOString() }).catch(() => {});
    // requestSunoGeneration já chamou recordSunoFailure com o motivo específico.
    return { retried: false, reason: 'nova_tentativa_falhou' };
  }

  try {
    await updateDoc(doc(db, 'suno_tasks', taskId), {
      retryTaskId: result.taskId,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    // Não desfaz a retentativa (a Kie.ai já foi chamada e já cobrou) — só perde o encadeamento
    // automático; o polling por este taskId antigo passa a depender da reconciliação achar a nova
    // tarefa por orderId, o que ainda acontece.
    console.warn('[suno] Falha ao encadear taskId de retentativa:', err.message);
  }

  await updateDoc(orderRef, {
    sunoAutoRetryCount: increment(1),
    sunoRetryReserved: false,
    updatedAt: new Date().toISOString(),
  }).catch((err) => console.warn('[suno] Falha ao atualizar contador de retentativas:', err.message));

  return { retried: true, newTaskId: result.taskId };
}
