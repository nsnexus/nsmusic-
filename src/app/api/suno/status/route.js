import { NextResponse } from 'next/server';
import { getTask, updateTaskResult, extractAudioTracks } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import {
  resolveLatestTaskId,
  maybeAutoRetrySunoFailure,
  recordSunoFailure,
  PROVIDER_KIE,
  PROVIDER_UNIFICALLY,
  PROVIDER_SUNO_LOCAL,
  resolvePrimaryProvider,
  requestSunoGeneration,
} from '@/lib/suno';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getTaskElapsedMs(task, orderData) {
  const taskCreatedTs = task?.createdAt ? Date.parse(task.createdAt) : NaN;
  if (!Number.isNaN(taskCreatedTs)) {
    return Date.now() - taskCreatedTs;
  }
  const orderReqTs = orderData?.sunoRequestedAt ? Date.parse(orderData.sunoRequestedAt) : NaN;
  if (!Number.isNaN(orderReqTs)) {
    return Date.now() - orderReqTs;
  }
  return 0;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 });
    }

    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    let unificallyApiKey = String(env.UNIFICALLY_API_KEY || process.env.UNIFICALLY_API_KEY || '').trim();
    let kieApiKey = String(env.KIE_API_KEY || process.env.KIE_API_KEY || '').trim();

    // Segue a cadeia de retentativas automáticas: se esta tarefa já falhou e foi reenviada por trás das cortinas,
    // o cliente que está fazendo polling pelo taskId original recebe o status da nova tarefa.
    const effectiveTaskId = await resolveLatestTaskId(taskId, env);

    // Busca metadados da tarefa no banco (se já foi gravada) para saber o provedor e status
    let task = null;
    try {
      task = await getTask(effectiveTaskId, env);
      if (task && task.status === 'COMPLETED') {
        const tracks = extractAudioTracks(task.result);
        if (tracks.length > 0) {
          return NextResponse.json({ status: "COMPLETED", tracks });
        }
      }
    } catch (dbErr) {
      console.warn('[api/suno/status] Aviso na busca inicial da tarefa:', dbErr?.message);
    }

    let orderId = task?.orderId || null;
    let orderData = null;
    if (orderId) {
      try {
        const { getOrder } = await import('@/lib/supabaseDb');
        orderData = await getOrder(orderId, env);
      } catch (e) {}
    } else {
      // Se não havia orderId gravado na task, busca se há pedido vinculado a este sunoTaskId
      try {
        const { getSupabaseEdge } = await import('@/lib/supabase-edge');
        const supabase = getSupabaseEdge(env);
        if (supabase) {
          const { data: ordRow } = await supabase
            .from('orders')
            .select('id, suno_requested_at, production_status, suno_provider')
            .or(`suno_task_id.eq.${effectiveTaskId},suno_task_id.eq.${taskId}`)
            .maybeSingle();
          if (ordRow?.id) {
            orderId = ordRow.id;
            orderData = {
              id: ordRow.id,
              sunoRequestedAt: ordRow.suno_requested_at,
              productionStatus: ordRow.production_status,
              sunoProvider: ordRow.suno_provider,
            };
          }
        }
      } catch (e) {}
    }

    // Fallback de segurança: se o cliente enviou orderId na query string, valida se o pedido realmente aponta para este taskId
    if (!orderId && searchParams.get('orderId')) {
      try {
        const { getOrder } = await import('@/lib/supabaseDb');
        const candidate = await getOrder(searchParams.get('orderId'), env);
        if (candidate && (candidate.sunoTaskId === effectiveTaskId || candidate.sunoTaskId === taskId)) {
          orderId = candidate.id;
          orderData = candidate;
        }
      } catch (e) {}
    }

    const stuckTimeoutMinutes = Number(env?.SUNO_STUCK_TIMEOUT_MINUTES || process.env.SUNO_STUCK_TIMEOUT_MINUTES) || 3;
    const STUCK_TIMEOUT_MS = stuckTimeoutMinutes * 60 * 1000;

    // Resolve o provedor com prioridade:
    // 1. Provedor explicitamente gravado na tarefa ou no pedido
    // 2. Provedor principal configurado no banco (config) ou env
    const primaryProvider = await resolvePrimaryProvider(env);
    const effectiveProvider = task?.provider || orderData?.sunoProvider || primaryProvider;
    const isKieFirst = effectiveProvider === PROVIDER_KIE;

    // -------------------------------------------------------------------------
    // Ramo do Provedor Suno Local (Robô Desktop no PC)
    // -------------------------------------------------------------------------
    if (effectiveProvider === PROVIDER_SUNO_LOCAL) {
      // 1. Se o pedido já possui áudio salvo (pelo robô), devolve COMPLETED imediatamente
      const firstAudio = orderData?.audioUrl || orderData?.musicUrl || orderData?.audio_url;
      if (firstAudio) {
        const tracks = [
          { audioUrl: firstAudio, audio_url: firstAudio, title: 'Versão 1' }
        ];
        const secondAudio = orderData?.audioFiles?.[1] || orderData?.musicUrl2 || orderData?.audio_files?.[1];
        if (secondAudio) {
          tracks.push({ audioUrl: secondAudio, audio_url: secondAudio, title: 'Versão 2' });
        }
        return NextResponse.json({ status: "COMPLETED", tracks, provider: PROVIDER_SUNO_LOCAL });
      }

      // 2. Se o robô reportou falha local, foi desviado para a Kie por concorrência/voz OU estourou o tempo de timeout (3 minutos):
      const elapsedMs = getTaskElapsedMs(task, orderData);
      const isFailedLocal = orderData?.status_robo === 'FALHA_LOCAL' ||
        orderData?.statusRobo === 'FALHA_LOCAL' ||
        orderData?.status_robo === 'DESVIADO_ROBO_OCUPADO' ||
        orderData?.status_robo === 'DESVIADO_VOZ_PERSONALIZADA';
      const isTimeout = elapsedMs > STUCK_TIMEOUT_MS;

      if ((isFailedLocal || isTimeout) && orderId) {
        console.warn(`[api/suno/status] Robô local ${isFailedLocal ? 'reportou falha' : 'atingiu timeout de 3min'}. Disparando failover automático para Kie.ai...`);
        const prompt = orderData?.lyrics || orderData?.letra || orderData?.story || '';
        const tags = orderData?.musicStyle || orderData?.style || orderData?.tags || 'Acoustic Pop';

        const failover = await requestSunoGeneration({
          orderId,
          prompt,
          tags,
          preferredProvider: PROVIDER_KIE
        }, env);

        if (failover.ok && failover.taskId) {
          return NextResponse.json({
            status: "PROCESSING",
            providerStatus: "FALLBACK_KIE",
            fallback: true,
            newTaskId: failover.taskId,
            provider: PROVIDER_KIE
          });
        }
      }

      // 3. Ainda dentro do prazo: continua em processamento pelo robô local
      return NextResponse.json({
        status: "PROCESSING",
        provider: PROVIDER_SUNO_LOCAL,
        elapsedMs,
        remainingMs: Math.max(0, STUCK_TIMEOUT_MS - elapsedMs)
      });
    }

    // Funções auxiliares para consulta e processamento das respostas de cada provedor
    const consultarKie = async () => {
      if (!kieApiKey) return null;
      try {
        const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${effectiveTaskId}`, {
          headers: {
            'Authorization': `Bearer ${kieApiKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (!kieRes.ok) {
          return { ok: false, status: kieRes.status };
        }
        const data = await kieRes.json();
        return { ok: true, data };
      } catch (err) {
        console.warn('[api/suno/status] Aviso na consulta Kie.ai:', err?.message);
        return { ok: false, error: err?.message };
      }
    };

    const processarRespostaKie = async (kieData) => {
      if (!kieData) return null;

      // Status pode vir em múltiplos locais (no data, no root ou no primeiro item de array)
      const rawStatus = String(
        (Array.isArray(kieData?.data) ? kieData.data[0]?.status : (kieData?.data?.status || kieData?.data?.state))
        || kieData?.status
        || kieData?.state
        || kieData?.data?.response?.status
        || ''
      ).toUpperCase();

      const tracksArray = extractAudioTracks(kieData);
      const hasRealAudio = tracksArray.length > 0 && tracksArray.some(t => {
        const u = t.audio_url || t.audioUrl || '';
        return typeof u === 'string' && u.startsWith('http');
      });

      const isReady = rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE') || rawStatus.includes('FINISH') || rawStatus.includes('DONE');
      const isPending = ['PENDING', 'RUNNING', 'QUEUED', 'SUBMITTED', 'IN_PROGRESS', 'PROCESSING'].includes(rawStatus);

      // Se temos áudios reais disponíveis e o status é de sucesso ou não está explicitamente pendente
      if ((isReady || hasRealAudio) && (!isPending || isReady)) {
        if (tracksArray.length > 0) {
          await updateTaskResult(effectiveTaskId, kieData, orderId, env);
          return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
        }
      }

      if (isPending) {
        return NextResponse.json({ status: "PROCESSING", kieStatus: rawStatus });
      }

      if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
        const motivo = `kie_status_${rawStatus}`;
        const retry = orderId
          ? await maybeAutoRetrySunoFailure({
              taskId: effectiveTaskId,
              orderId,
              env,
              reason: motivo,
              preferredProvider: PROVIDER_UNIFICALLY
            })
          : { retried: false, reason: 'sem_order_id' };

        if (retry.retried) {
          return NextResponse.json({
            status: "PROCESSING",
            providerStatus: "FALLBACK_UNIFICALLY",
            fallback: true,
            newTaskId: retry.newTaskId
          });
        }

        if (orderId) await recordSunoFailure(orderId, `${motivo}_${retry.reason}`, env);

        return NextResponse.json({
          status: "ERROR",
          error: kieData?.data?.errorMessage || kieData?.errorMessage || `Kie.ai retornou status: ${rawStatus}`
        });
      }

      return null;
    };

    const consultarUnifically = async () => {
      if (!unificallyApiKey) return null;
      try {
        const unifRes = await fetch(`https://api.unifically.com/v1/tasks/${effectiveTaskId}`, {
          headers: {
            'Authorization': `Bearer ${unificallyApiKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });
        if (!unifRes.ok) {
          return { ok: false, status: unifRes.status };
        }
        const data = await unifRes.json();
        return { ok: true, data };
      } catch (err) {
        console.warn('[api/suno/status] Aviso na consulta Unifically:', err?.message);
        return { ok: false, error: err?.message };
      }
    };

    const processarRespostaUnifically = async (unifData) => {
      if (!unifData) return null;
      const taskData = unifData?.data || unifData;
      const rawStatus = String(taskData?.status || unifData?.status || '').toLowerCase();

      if (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success') {
        const tracksArray = extractAudioTracks(unifData).length > 0
          ? extractAudioTracks(unifData)
          : extractAudioTracks(taskData);

        if (tracksArray.length > 0) {
          await updateTaskResult(effectiveTaskId, unifData, orderId, env);
          return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
        }
      }

      if (rawStatus === 'processing' || rawStatus === 'pending' || rawStatus === 'queued' || rawStatus === 'running') {
        const elapsedMs = getTaskElapsedMs(task, orderData);

        // Se estiver em processamento há mais de 3 minutos, aciona o fallback para Kie.ai
        if (elapsedMs >= STUCK_TIMEOUT_MS && orderId && kieApiKey) {
          console.warn(`[api/suno/status] Tarefa Unifically ${effectiveTaskId} (pedido ${orderId}) há ${Math.round(elapsedMs / 1000)}s (> ${stuckTimeoutMinutes} min) em processamento. Acionando fallback para Kie.ai...`);
          const retry = await maybeAutoRetrySunoFailure({
            taskId: effectiveTaskId,
            orderId,
            env,
            reason: 'unifically_timeout_3min',
            preferredProvider: PROVIDER_KIE
          });

          if (retry.retried) {
            return NextResponse.json({
              status: "PROCESSING",
              providerStatus: "FALLBACK_KIE",
              fallback: true,
              newTaskId: retry.newTaskId
            });
          }

          if (retry.reason === 'reservado_por_outra_chamada') {
            return NextResponse.json({ status: "PROCESSING", providerStatus: "RETRYING" });
          }

          if (retry.reason === 'limite_esgotado') {
            await recordSunoFailure(orderId, 'unifically_timeout_3min_limite_esgotado', env);
            return NextResponse.json({
              status: "ERROR",
              error: "Tempo de geração esgotado. Nossa equipe foi notificada."
            });
          }
        }

        return NextResponse.json({ status: "PROCESSING", providerStatus: rawStatus });
      }

      if (rawStatus === 'failed' || rawStatus === 'error') {
        const motivo = `unifically_status_${rawStatus}_${taskData?.error_message || taskData?.message || ''}`;

        const retry = (orderId && kieApiKey)
          ? await maybeAutoRetrySunoFailure({
              taskId: effectiveTaskId,
              orderId,
              env,
              reason: motivo,
              preferredProvider: PROVIDER_KIE
            })
          : { retried: false, reason: 'sem_order_id_ou_chave' };

        if (retry.retried) {
          return NextResponse.json({
            status: "PROCESSING",
            providerStatus: "FALLBACK_KIE",
            fallback: true,
            newTaskId: retry.newTaskId
          });
        }

        if (orderId) await recordSunoFailure(orderId, `${motivo}_${retry.reason}`, env);

        return NextResponse.json({
          status: "ERROR",
          error: taskData?.error_message || taskData?.message || `Unifically retornou status: ${rawStatus}`
        });
      }

      return null;
    };

    // ============================================================
    // EXECUÇÃO RESPEITANDO O PROVEDOR PRINCIPAL (COM FAILOVER MÚTUO)
    // ============================================================
    if (!unificallyApiKey && !kieApiKey) {
      console.error('[api/suno/status] Nenhuma chave de provedor (UNIFICALLY_API_KEY ou KIE_API_KEY) configurada.');
      return NextResponse.json({ error: 'Configuração ausente: chaves de geração de música não definidas no servidor.' }, { status: 500 });
    }

    if (isKieFirst) {
      // 1. Consulta Kie.ai primeiro
      const kieRes = await consultarKie();
      if (kieRes?.ok) {
        const resp = await processarRespostaKie(kieRes.data);
        if (resp) return resp;
      }

      // Se a Kie.ai não encontrou (404) ou falhou, tenta Unifically
      if (unificallyApiKey) {
        const unifRes = await consultarUnifically();
        if (unifRes?.ok) {
          const resp = await processarRespostaUnifically(unifRes.data);
          if (resp) return resp;
        }
      }
    } else {
      // 1. Consulta Unifically primeiro
      const unifRes = await consultarUnifically();
      if (unifRes?.ok) {
        const resp = await processarRespostaUnifically(unifRes.data);
        if (resp) return resp;
      } else if (unifRes && (unifRes.status === 402 || unifRes.status === 401)) {
        // Erro de crédito na Unifically -> failover imediato para Kie.ai
        if (orderId && kieApiKey) {
          const retry = await maybeAutoRetrySunoFailure({
            taskId: effectiveTaskId,
            orderId,
            env,
            reason: `unifically_http_${unifRes.status}`,
            preferredProvider: PROVIDER_KIE
          });
          if (retry.retried) {
            return NextResponse.json({
              status: "PROCESSING",
              providerStatus: "FALLBACK_KIE",
              fallback: true,
              newTaskId: retry.newTaskId
            });
          }
        }
      }

      // Se a Unifically não reconheceu (404/400) ou falhou, tenta Kie.ai como fallback
      if (kieApiKey) {
        const kieRes = await consultarKie();
        if (kieRes?.ok) {
          const resp = await processarRespostaKie(kieRes.data);
          if (resp) return resp;
        }
      }
    }

    // ============================================================
    // SECUNDÁRIO: Banco de Dados (webhook ou outro worker pode ter gravado)
    // ============================================================
    try {
      const freshTask = await getTask(effectiveTaskId, env);
      if (freshTask && freshTask.status === "COMPLETED") {
        const tracks = extractAudioTracks(freshTask.result);
        if (tracks.length > 0) {
          return NextResponse.json({ status: "COMPLETED", tracks });
        }
      }
    } catch (dbErr) {
      console.warn("[api/suno/status] Aviso na busca de fallback em banco:", dbErr?.message);
    }

    return NextResponse.json({ status: "PROCESSING" });
  } catch (error) {
    console.error("Erro consultando status:", error);
    return NextResponse.json({ status: "PROCESSING", error: error.message }, { status: 200 });
  }
}
