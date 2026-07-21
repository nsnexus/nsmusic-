import { NextResponse } from 'next/server';
import { updateTaskResult } from '@/lib/db';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const data = await req.json();
    console.log("Kie.ai Webhook recebido:", data);

    const taskId = data.task_id || data.id || (data.data && (data.data.taskId || data.data.task_id));
    
    if (taskId) {
      // Salva no banco em segundo plano para responder 200 instantaneamente à Kie.ai
      updateTaskResult(taskId, data).catch(e => console.warn("Aviso ao atualizar task no webhook:", e));
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      console.error("Webhook recebido sem taskId", data);
      return NextResponse.json({ error: "Missing task_id" }, { status: 200 });
    }
  } catch (error) {
    console.error("Erro processando webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
