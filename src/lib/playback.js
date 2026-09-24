// Chamada à Kie.ai pra separar vocal/instrumental de uma música já gerada (add-on de playback,
// R$ 4,99 — ver src/lib/pricing.js). Espelha src/lib/suno.js:requestSunoGeneration (mesmo timeout,
// mesmo padrão de erro genérico pro cliente vs log detalhado no servidor), mas é uma tarefa
// assíncrona DIFERENTE da geração de música: taskId/webhook aqui não têm nada a ver com suno_tasks.
//
// Disparada automaticamente por src/lib/payments.js:applyPaymentApproval assim que o pagamento do
// add-on é aprovado — nunca chamada a partir de um clique do cliente.

import { doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from './firebase-edge.js';
import { readEnvValue, isTransientKieFailure } from './suno.js';
import { resolverSiteUrl } from './siteUrl.js';

/**
 * A separação vocal continua toda na Kie.ai, inclusive para música gerada na VPS própria (decisão
 * do dono do estúdio, 24/09/2026). O endpoint aceita duas formas de apontar a faixa:
 *
 *   - `taskId` + `audioId` — faixa gerada na PRÓPRIA conta Kie.ai;
 *   - `audioUrl` + `audioId` — áudio externo.
 *
 * Música feita na VPS não existe na conta Kie.ai: mandar o `sunoTaskId` dela seria apontar para
 * uma tarefa que a Kie.ai nunca viu, e o cliente pagaria R$ 4,99 por um playback que nunca sai. Por
 * isso, quando o pedido veio da VPS, mandamos a URL do MP3 (cdn1.suno.ai, ou a cópia já arquivada
 * no nosso storage — as duas são públicas e a Kie.ai consegue baixar).
 *
 * @param {{orderId: string, sunoTaskId: string, audioId: string, audioUrl?: string, provider?: string}} params
 *   vêm de orders/{orderId}: .sunoTaskId, .audioIds[0], .audioUrl e .sunoProvider.
 * @param {object} env contexto de ambiente da rota chamadora
 * @returns {Promise<{ok: true, taskId: string} | {ok: false, error: string}>}
 */
export async function requestPlaybackGeneration({ orderId, sunoTaskId, audioId, audioUrl, provider }, env) {
  // Faixa da própria Kie.ai é referenciada por taskId; qualquer outra origem, pela URL do áudio.
  const usaAudioExterno = Boolean(provider && provider !== 'kie');

  if (!orderId || !audioId || (usaAudioExterno ? !audioUrl : !sunoTaskId)) {
    return { ok: false, error: 'missing_arguments' };
  }

  const apiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!apiKey) {
    console.error('[playback] Variável de ambiente KIE_API_KEY não configurada.');
    return { ok: false, error: 'missing_api_key' };
  }

  const baseUrl = resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'));

  // orderId embutido na query string (não é PII, é só o ID do pedido) porque, diferente da geração
  // de música, não existe uma coleção tipo suno_tasks pra resolver taskId->orderId no webhook.
  const webhookSecret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
  const callbackUrl = webhookSecret
    ? `${baseUrl}/api/playback/webhook?secret=${encodeURIComponent(webhookSecret)}&orderId=${encodeURIComponent(orderId)}`
    : `${baseUrl}/api/playback/webhook?orderId=${encodeURIComponent(orderId)}`;

  const maxKieAttempts = 3;
  let response, data;
  for (let attempt = 1; attempt <= maxKieAttempts; attempt++) {
    try {
      response = await fetch('https://api.kie.ai/api/v1/vocal-removal/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          ...(usaAudioExterno ? { audioUrl } : { taskId: sunoTaskId }),
          audioId: audioId,
          type: 'separate_vocal',
          callBackUrl: callbackUrl
        }),
        signal: AbortSignal.timeout(15000)
      });

      data = await response.json().catch(() => ({}));

      if (response.ok && (!data.code || data.code === 200)) break;

      // 422 tratado como transitório SÓ AQUI (não em isTransientKieFailure, compartilhado com a
      // geração de música — lá um 422 costuma ser payload/conteúdo rejeitado de verdade, retentar
      // seria desperdiçar crédito). Nesta rota, um pedido pago (wI7Z7ro5a6jJfKCZpBRe, 03/09/2026)
      // recebeu 422 na primeira tentativa e a MESMA chamada, idêntica, funcionou minutos depois —
      // sinal de instabilidade momentânea do lado da Kie.ai nesse endpoint específico, não payload
      // inválido. Sem retry aqui, o cliente ficava com o pagamento aprovado e o produto nunca gerado.
      const ehTransitorio = isTransientKieFailure(response.status, data.code) || response.status === 422;
      if (!ehTransitorio) break;
      console.warn(`[playback] Erro transitório da Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, response.status, data.code);
    } catch (fetchErr) {
      console.warn(`[playback] Falha de rede ao chamar Kie.ai (tentativa ${attempt}/${maxKieAttempts}):`, fetchErr.message);
      response = null;
      data = { msg: fetchErr.message };
    }
    if (attempt < maxKieAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  const orderRef = doc(db, 'orders', orderId);

  // Mensagem de erro nunca ecoa o texto bruto do provedor (ver .claude/rules/security.md) — o motivo
  // detalhado fica só no log do servidor.
  if (!response || !response.ok || (data.code && data.code !== 200)) {
    console.error('[playback] Erro no retorno da Kie.ai:', response?.status, data?.code, data?.msg || data?.message);
    try {
      await updateDoc(orderRef, {
        playbackStatus: 'FAILED',
        playbackError: `kie_${data?.code || response?.status || 'network'}`,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[playback] Falha ao registrar erro de geração no pedido:', err.message);
    }
    return { ok: false, error: 'kie_request_failed' };
  }

  const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId || data?.task_id;
  if (!taskId) {
    console.error('[playback] Kie.ai não retornou um taskId válido:', data);
    try {
      await updateDoc(orderRef, {
        playbackStatus: 'FAILED',
        playbackError: 'kie_no_taskid',
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('[playback] Falha ao registrar erro de geração no pedido:', err.message);
    }
    return { ok: false, error: 'no_task_id' };
  }

  try {
    await updateDoc(orderRef, {
      playbackTaskId: taskId,
      playbackStatus: 'PROCESSING',
      playbackRequestedAt: new Date().toISOString(),
      playbackError: null,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('[playback] Erro ao atualizar status do pedido para PROCESSING:', err.message);
    return { ok: false, error: 'order_update_failed' };
  }

  return { ok: true, taskId };
}
