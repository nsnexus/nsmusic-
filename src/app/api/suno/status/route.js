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

    let apiKey = String(env.KIE_API_KEY || process.env.KIE_API_KEY || '').trim();

    if (!apiKey) {
      console.error('[api/suno/status] Variável de ambiente KIE_API_KEY não configurada.');
      return NextResponse.json({ error: 'Configuração ausente: KIE_API_KEY não definida no servidor.' }, { status: 500 });
    }

    // Segue a cadeia de retentativas automáticas (ver src/lib/suno.js): se esta tarefa já falhou e
    // foi reenviada por trás das cortinas, o cliente que está fazendo polling pelo taskId ORIGINAL
    // acaba consultando o resultado da tarefa nova, sem precisar saber que ela existe.
    const effectiveTaskId = await resolveLatestTaskId(taskId);

    // ============================================================
    // 1. PRIMÁRIO: Consulta direta na API da Kie.ai (sem depender do Firestore)
    //    - Responde em ~800ms
    //    - Funciona 100% no Edge Runtime do Cloudflare
    //    - Reconhece TEXT_SUCCESS (stream pronto) e SUCCESS (MP3 finalizado)
    // ============================================================
    try {
      const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${effectiveTaskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (kieRes.ok) {
        const kieData = await kieRes.json();

        if (kieData?.data) {
          const rawStatus = String(kieData.data.status || kieData.data.state || '').toUpperCase();

          // Reconhece TODOS os status de sucesso da Kie.ai:
          // - "SUCCESS" = MP3 final processado
          // - "TEXT_SUCCESS" = Stream de áudio pronto (mais rápido, ~45s)
          // - "FIRST_SUCCESS" = Primeira versão disponível
          const isReady = rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE');

          if (isReady) {
            const tracksArray = extractAudioTracks(kieData);
            if (tracksArray.length > 0) {
              // Garante a atualização do pedido no Firestore e envio do WhatsApp antes de responder
              await updateTaskResult(effectiveTaskId, kieData);
              return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
            }
          }

          // Se está em PENDING ou RUNNING, retorna progresso
          if (rawStatus === 'PENDING' || rawStatus === 'RUNNING' || rawStatus === 'QUEUED') {
            return NextResponse.json({ status: "PROCESSING", kieStatus: rawStatus });
          }

          // Falha definitiva reportada pela Kie.ai: tenta retentativa automática antes de admitir
          // erro ao cliente. Enquanto houver orçamento de tentativas (ver MAX_AUTO_RETRIES em
          // src/lib/suno.js), o cliente nem chega a ver essa falha — continua vendo "PROCESSING" e o
          // polling segue, agora seguindo a cadeia acima na próxima consulta.
          if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
            const task = await getTask(effectiveTaskId);
            const orderId = task?.orderId || null;
            const motivo = `kie_status_${rawStatus}`;

            const retry = orderId
              ? await maybeAutoRetrySunoFailure({ taskId: effectiveTaskId, orderId, env, reason: motivo })
              : { retried: false, reason: 'sem_order_id' };

            if (retry.retried) {
              return NextResponse.json({ status: "PROCESSING", kieStatus: "RETRYING" });
            }

            // Sem orderId associado não há pedido para marcar — registra só quando existe.
            if (orderId) await recordSunoFailure(orderId, `${motivo}_${retry.reason}`);

            return NextResponse.json({
              status: "ERROR",
              error: kieData.data.errorMessage || `Kie.ai retornou status: ${rawStatus}`
            });
          }
        }
        // Se data é null, a Kie.ai não reconhece esse taskId — tentar Firestore
      }
    } catch (kieErr) {
      console.warn("Aviso na consulta Kie.ai:", kieErr?.message);
    }

    // ============================================================
    // 2. SECUNDÁRIO: Firestore (webhook pode ter gravado o resultado)
    //    - Usado quando a Kie.ai retorna data:null (taskId expirado/antigo)
    //    - Pode falhar no Edge por permissões, mas tentamos com try/catch
    // ============================================================
    try {
      const task = await getTask(effectiveTaskId);
      if (task && task.status === "COMPLETED") {
        const tracks = extractAudioTracks(task.result);
        if (tracks.length > 0) {
          return NextResponse.json({ status: "COMPLETED", tracks });
        }
      }
    } catch (dbErr) {
      console.warn("Aviso na busca Firestore em Edge Runtime:", dbErr?.message);
    }

    return NextResponse.json({ status: "PROCESSING" });
  } catch (error) {
    console.error("Erro consultando status:", error);
    return NextResponse.json({ status: "PROCESSING", error: error.message }, { status: 200 });
  }
}
