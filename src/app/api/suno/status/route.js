import { NextResponse } from 'next/server';
import { getTask, updateTaskResult } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 });
    }

    // 1. Checa primeiro no banco local (Firestore)
    const task = await getTask(taskId);

    if (task && task.status === "COMPLETED") {
      let tracks = [];
      if (task.result) {
        if (Array.isArray(task.result.data)) {
          tracks = task.result.data;
        } else if (task.result.data) {
          tracks = [task.result.data];
        } else if (task.result.tracks) {
          tracks = Array.isArray(task.result.tracks) ? task.result.tracks : [task.result.tracks];
        }
      }
      return NextResponse.json({ status: "COMPLETED", tracks: tracks });
    }

    // 2. Fallback direto na API da Kie.ai caso ainda não conste como concluído no banco local
    const apiKey = '76daad0e2a577569aaaa67715aec3c87'; // Kie.ai API Key
    try {
      const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (kieRes.ok) {
        const kieData = await kieRes.json();
        
        // Extrai as faixas dependendo da estrutura retornada pela Kie.ai
        const rawTracks = kieData?.data?.response?.sunoData || kieData?.data?.sunoData || kieData?.data?.tracks || kieData?.data || kieData?.response?.tracks || [];
        const tracksArray = Array.isArray(rawTracks) ? rawTracks : (rawTracks ? [rawTracks] : []);
        const kieStatus = kieData?.data?.status || kieData?.status;

        // Se a Kie.ai concluiu a geração ou já temos links de áudio válidos
        const isSuccess = kieStatus === 'SUCCESS' || kieStatus === 'SUCCESSFULLY' || (tracksArray.length > 0 && tracksArray[0]?.audio_url);

        if (isSuccess && tracksArray.length > 0) {
          const payloadToSave = {
            data: tracksArray,
            status: 'COMPLETED',
            rawKieResponse: kieData
          };

          // Salva no Firestore imediatamente
          await updateTaskResult(taskId, payloadToSave);

          return NextResponse.json({ status: "COMPLETED", tracks: tracksArray });
        }
      }
    } catch (kieErr) {
      console.warn("Aviso na consulta direta de fallback Kie.ai:", kieErr.message);
    }

    return NextResponse.json({ status: task ? task.status : "PROCESSING" });
  } catch (error) {
    console.error("Erro consultando status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
