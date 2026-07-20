import { NextResponse } from 'next/server';
import { getTask, updateTaskResult, extractAudioTracks } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const orderId = searchParams.get('orderId');

    if (!taskId || taskId === 'undefined') {
      return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 });
    }

    // 1. Checa primeiro no banco local (Firestore)
    const task = await getTask(taskId);

    if (task && task.status === "COMPLETED") {
      const tracks = extractAudioTracks(task.result);
      if (tracks.length > 0) {
        return NextResponse.json({ status: "COMPLETED", tracks });
      }
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
        
        // Extração universal das faixas via extractAudioTracks
        const tracksArray = extractAudioTracks(kieData);
        const rawKieStatus = String(kieData?.data?.status || kieData?.status || kieData?.data?.state || '').toUpperCase();

        // Se a Kie.ai concluiu a geração ou se retornou os links de áudio
        const isSuccess = rawKieStatus.includes('SUCCESS') || rawKieStatus.includes('SUCESSO') || tracksArray.length > 0;

        if (isSuccess && tracksArray.length > 0) {
          // Salva no Firestore imediatamente (atualizando suno_tasks e orders)
          await updateTaskResult(taskId, kieData, orderId);

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
