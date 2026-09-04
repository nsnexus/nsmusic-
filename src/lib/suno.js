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

export function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

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
 * Chama a Kie.ai para iniciar uma geração de música e persiste o vínculo taskId->orderId. Uma única
 * tentativa lógica (com retentativa de REDE embutida para timeout/5xx — ver isTransientKieFailure);
 * não decide política de quantas vezes retentar depois de uma falha definitiva, isso é
 * responsabilidade de quem chama (a rota, para o clique manual; maybeAutoRetrySunoFailure, para o
 * automático).
 *
 * @param {{orderId: string, prompt: string, tags: string}} params
 * @param {object} env
 * @returns {Promise<{ok: true, taskId: string} | {ok: false, error: string, status: number}>}
 */
export async function requestSunoGeneration({ orderId, prompt, tags }, env) {
  const apiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!apiKey) {
    console.error('[suno] Variável de ambiente KIE_API_KEY não configurada.');
    return { ok: false, error: 'Configuração ausente: KIE_API_KEY não definida no servidor.', status: 500 };
  }

  // Garante a URL do webhook no domínio oficial de produção.
  const rawUrl = readEnvValue(env, 'NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '');
  const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;

  // Segredo compartilhado no callback: /api/suno/webhook confere este valor antes de processar
  // (ver A-03 no AUDIT_REPORT.md — o webhook não tinha nenhuma autenticação).
  const webhookSecret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
  const callbackUrl = webhookSecret
    ? `${baseUrl}/api/suno/webhook?secret=${encodeURIComponent(webhookSecret)}`
    : `${baseUrl}/api/suno/webhook`;

  // Até 2 tentativas extras para erros transitórios (timeout, falha de rede, 5xx). Erros
  // definitivos (4xx, ex: payload ou chave inválida) não são reexecutados. Cada tentativa cria
  // seu PRÓPRIO AbortSignal.timeout — reaproveitar o mesmo sinal entre tentativas faria as
  // tentativas seguintes abortarem na hora, já que o relógio do sinal conta a partir da criação.
  const maxKieAttempts = 3;
  let response, data;
  for (let attempt = 1; attempt <= maxKieAttempts; attempt++) {
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
        signal: AbortSignal.timeout(15000)
      });

      data = await response.json().catch(() => ({}));

      if (response.ok && (!data.code || data.code === 200)) break;

      if (!isTransientKieFailure(response.status, data.code)) break;
      console.warn(`[suno] Erro transitório da Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, response.status, data.code);
    } catch (fetchErr) {
      console.warn(`[suno] Falha de rede ao chamar Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, fetchErr.message);
      response = null;
      data = { msg: fetchErr.message };
    }
    if (attempt < maxKieAttempts) {
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

  const saved = await saveTask(taskId, 'PROCESSING', null, orderId);
  if (!saved) {
    await recordSunoFailure(orderId, 'save_task_failed');
    return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
  }

  if (orderId) {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        productionStatus: 'GERANDO_AUDIO',
        sunoRequestedAt: new Date().toISOString(),
        sunoError: null,
        // Guardado pra permitir separação vocal (add-on de playback) depois — a Kie.ai identifica a
        // faixa por taskId+audioId da geração original, ver src/lib/playback.js.
        sunoTaskId: taskId,
        // Conta cada chamada que a Kie.ai de fato aceitou (e portanto cobrou) — usado no painel
        // admin para estimar o gasto com geração. increment() soma mesmo sem leitura prévia, então
        // sobrevive a retentativas concorrentes sem duplicar nem perder contagem.
        sunoGenerationCount: increment(1),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[suno] Erro ao atualizar status do pedido para GERANDO_AUDIO:', err.message);
      await recordSunoFailure(orderId, 'order_update_failed');
      return { ok: false, error: 'A geração foi iniciada, mas houve uma falha ao registrar o pedido. A equipe será notificada.', status: 502 };
    }
  }

  return { ok: true, taskId };
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
