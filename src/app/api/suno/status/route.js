import { NextResponse } from 'next/server';
import { getTask, updateTaskResult, extractAudioTracks } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { resolveLatestTaskId, maybeAutoRetrySunoFailure, recordSunoFailure } from '@/lib/suno';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    // orderId NUNCA vem da query string: um cliente poderia gravar o áudio de uma tarefa no pedido de
    // outro cliente (ver A-02 no AUDIT_REPORT.md). O orderId correto é sempre o que foi associado à
    // tarefa em /api/suno/generate, lido de dentro de updateTaskResult/lib/db.js a partir do suno_tasks.

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

    // Segue a cadeia de retentativas automáticas (ver src/lib/suno.js): se esta tarefa já falhou e
    // foi reenviada por trás das cortinas, o cliente que está fazendo polling pelo taskId ORIGINAL
    // acaba consultando o resultado da tarefa nova, sem precisar saber que ela existe.
    const effectiveTaskId = await resolveLatestTaskId(taskId);

    if (!unificallyApiKey && !kieApiKey) {
      console.error('[api/suno/status] Nenhuma chave de provedor (UNIFICALLY_API_KEY ou KIE_API_KEY) configurada.');
      return NextResponse.json({ error: 'Configuração ausente: chaves de geração de música não definidas no servidor.' }, { status: 500 });
    }

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

    const isUnificallyTask = task?.provider === 'unifically' || (!task?.provider && Boolean(unificallyApiKey));

    // ============================================================
    // 1. TAREFA DA UNIFICALLY: Consulta direta na API da Unifically
    // ============================================================
    if (isUnificallyTask && unificallyApiKey) {
      try {
        const unifRes = await fetch(`https://api.unifically.com/v1/tasks/${effectiveTaskId}`, {
          headers: {
            'Authorization': `Bearer ${unificallyApiKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (unifRes.ok) {
          const unifData = await unifRes.json();
          const taskData = unifData?.data || unifData;
          const rawStatus = String(taskData?.status || unifData?.status || '').toLowerCase();

          if (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success') {
            const tracksArray = extractAudioTracks(unifData).length > 0
              ? extractAudioTracks(unifData)
              : extractAudioTracks(taskData);

            if (tracksArray.length > 0) {
              await updateTaskResult(effectiveTaskId, unifData, null, env);
              return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
            }
          }

          if (rawStatus === 'processing' || rawStatus === 'pending' || rawStatus === 'queued' || rawStatus === 'running') {
            return NextResponse.json({ status: "PROCESSING", providerStatus: rawStatus });
          }

          if (rawStatus === 'failed' || rawStatus === 'error') {
            const orderId = task?.orderId || null;
            const motivo = `unifically_status_${rawStatus}`;

            const retry = orderId
              ? await maybeAutoRetrySunoFailure({ taskId: effectiveTaskId, orderId, env, reason: motivo })
              : { retried: false, reason: 'sem_order_id' };

            if (retry.retried) {
              return NextResponse.json({ status: "PROCESSING", providerStatus: "RETRYING" });
            }

            if (orderId) await recordSunoFailure(orderId, `${motivo}_${retry.reason}`);

            return NextResponse.json({
              status: "ERROR",
              error: taskData?.error_message || taskData?.message || `Unifically retornou status: ${rawStatus}`
            });
          }
        }
      } catch (unifErr) {
        console.warn("[api/suno/status] Aviso na consulta Unifically:", unifErr?.message);
      }
    }

    // ============================================================
    // 2. TAREFA DA KIE.AI (OU FALLBACK): Consulta direta na API da Kie.ai
    // ============================================================
    if (kieApiKey && (!task || task.provider === 'kie' || !isUnificallyTask)) {
      try {
        const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${effectiveTaskId}`, {
          headers: {
            'Authorization': `Bearer ${kieApiKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(10000)
        });

        if (kieRes.ok) {
          const kieData = await kieRes.json();

          if (kieData?.data) {
            const rawStatus = String(kieData.data.status || kieData.data.state || '').toUpperCase();

            const isReady = rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE');

            if (isReady) {
              const tracksArray = extractAudioTracks(kieData);
              if (tracksArray.length > 0) {
                await updateTaskResult(effectiveTaskId, kieData, null, env);
                return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
              }
            }

            if (rawStatus === 'PENDING' || rawStatus === 'RUNNING' || rawStatus === 'QUEUED') {
              return NextResponse.json({ status: "PROCESSING", kieStatus: rawStatus });
            }

            if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
              const orderId = task?.orderId || null;
              const motivo = `kie_status_${rawStatus}`;

              const retry = orderId
                ? await maybeAutoRetrySunoFailure({ taskId: effectiveTaskId, orderId, env, reason: motivo })
                : { retried: false, reason: 'sem_order_id' };

              if (retry.retried) {
                return NextResponse.json({ status: "PROCESSING", kieStatus: "RETRYING" });
              }

              if (orderId) await recordSunoFailure(orderId, `${motivo}_${retry.reason}`);

              return NextResponse.json({
                status: "ERROR",
                error: kieData.data.errorMessage || `Kie.ai retornou status: ${rawStatus}`
              });
            }
          }
        }
      } catch (kieErr) {
        console.warn("[api/suno/status] Aviso na consulta Kie.ai:", kieErr?.message);
      }
    }

    // ============================================================
    // 3. SECUNDÁRIO: Banco de Dados (webhook pode ter gravado o resultado)
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
