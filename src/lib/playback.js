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

/**
 * @param {{orderId: string, sunoTaskId: string, audioId: string}} params identificam a faixa já
 *   gerada na Kie.ai — vem de orders/{orderId}.sunoTaskId e .audioIds[0], gravados na geração
 *   original (ver src/lib/suno.js e src/lib/db.js:updateTaskResult).
 * @param {object} env contexto de ambiente da rota chamadora
 * @returns {Promise<{ok: true, taskId: string} | {ok: false, error: string}>}
 */
export async function requestPlaybackGeneration({ orderId, sunoTaskId, audioId }, env) {
  if (!orderId || !sunoTaskId || !audioId) {
    return { ok: false, error: 'missing_arguments' };
  }

  const apiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!apiKey) {
    console.error('[playback] Variável de ambiente KIE_API_KEY não configurada.');
    return { ok: false, error: 'missing_api_key' };
  }

  const rawUrl = readEnvValue(env, 'NEXT_PUBLIC_SITE_URL').replace(/\/+$/, '');
  const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost')) ? 'https://nsmusic.nsnexus.com.br' : rawUrl;

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
          taskId: sunoTaskId,
          audioId: audioId,
          type: 'separate_vocal',
          callBackUrl: callbackUrl
        }),
        signal: AbortSignal.timeout(15000)
      });

      data = await response.json().catch(() => ({}));

      if (response.ok && (!data.code || data.code === 200)) break;

      if (!isTransientKieFailure(response.status, data.code)) break;
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
