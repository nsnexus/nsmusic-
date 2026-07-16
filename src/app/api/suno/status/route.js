import { NextResponse } from 'next/server';
import { getTask } from '@/lib/db';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json({ error: "taskId é obrigatório" }, { status: 400 });
    }

    const task = await getTask(taskId);

    if (!task) {
      return NextResponse.json({ status: "NOT_FOUND" });
    }

    if (task.status === "COMPLETED") {
      // Retorna as tracks se a Kie.ai enviou na propriedade "data"
      let tracks = [];
      if (task.result && task.result.data) {
          tracks = Array.isArray(task.result.data) ? task.result.data : [task.result.data];
      }
      return NextResponse.json({ status: "COMPLETED", tracks: tracks });
    }

    return NextResponse.json({ status: task.status });
  } catch (error) {
    console.error("Erro consultando status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
