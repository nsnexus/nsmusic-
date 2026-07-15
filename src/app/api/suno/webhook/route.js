import { NextResponse } from 'next/server';
import { updateTaskResult } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const data = await req.json();
    console.log("Kie.ai Webhook recebido:", data);

    const taskId = data.task_id || data.id || (data.data && data.data.task_id);
    
    if (taskId) {
      // Kie.ai costuma devolver as tracks no array data.data ou simplesmente enviar o status.
      // Vamos salvar tudo no banco e deixar o frontend processar.
      updateTaskResult(taskId, data);
      return NextResponse.json({ success: true });
    } else {
      console.error("Webhook recebido sem taskId", data);
      return NextResponse.json({ error: "Missing task_id" }, { status: 400 });
    }
  } catch (error) {
    console.error("Erro processando webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
