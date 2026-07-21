import { NextResponse } from 'next/server';
import { getTask, updateTaskResult, extractAudioTracks } from '@/lib/db';
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const orderId = searchParams.get('orderId');

    if (!taskId || taskId === 'undefined') {
      return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 });
    }

    const apiKey = '76daad0e2a577569aaaa67715aec3c87';

    // ============================================================
    // 1. PRIMÁRIO: Consulta direta na API da Kie.ai (sem depender do Firestore)
    //    - Responde em ~800ms
    //    - Funciona 100% no Edge Runtime do Cloudflare
    //    - Reconhece TEXT_SUCCESS (stream pronto) e SUCCESS (MP3 finalizado)
    // ============================================================
    try {
      const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
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
              // Salva no Firestore em background (não bloqueia a resposta)
              updateTaskResult(taskId, kieData, orderId).catch(e => console.warn("Aviso ao salvar no Firestore:", e));
              return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
            }
          }

          // Se está em PENDING ou RUNNING, retorna progresso
          if (rawStatus === 'PENDING' || rawStatus === 'RUNNING' || rawStatus === 'QUEUED') {
            return NextResponse.json({ status: "PROCESSING", kieStatus: rawStatus });
          }

          // Se tem erro, retorna o erro da Kie.ai
          if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
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
      const task = await getTask(taskId);
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
