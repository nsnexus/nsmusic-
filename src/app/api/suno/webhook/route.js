import { NextResponse } from 'next/server';
import { updateTaskResult } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

function getWebhookSecret() {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.KIE_WEBHOOK_SECRET) return String(ctx.env.KIE_WEBHOOK_SECRET).trim();
  } catch (e) {}
  return String(process.env.KIE_WEBHOOK_SECRET || '').trim();
}

export async function POST(req) {
  try {
    // Autenticação por segredo compartilhado na URL de callback (ver A-03 no AUDIT_REPORT.md).
    // Se KIE_WEBHOOK_SECRET não estiver configurado ainda, a checagem é pulada com aviso — configure
    // a variável e registre a nova URL de callback (com ?secret=...) assim que possível.
    const expectedSecret = getWebhookSecret();
    if (expectedSecret) {
      const { searchParams } = new URL(req.url);
      const providedSecret = searchParams.get('secret') || '';
      if (providedSecret !== expectedSecret) {
        console.warn('[Webhook Kie.ai] Segredo ausente ou inválido — notificação rejeitada.');
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
    } else {
      console.warn('[Webhook Kie.ai] KIE_WEBHOOK_SECRET não configurado — aceitando sem autenticação.');
    }

    const data = await req.json();
    console.log("Kie.ai Webhook recebido:", { taskId: data.task_id || data.id || data?.data?.taskId || data?.data?.task_id });

    const taskId = data.task_id || data.id || (data.data && (data.data.taskId || data.data.task_id));

    if (taskId) {
      // Salva no banco e garante a entrega da notificação de WhatsApp antes de finalizar
      await updateTaskResult(taskId, data);
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      console.error("Webhook recebido sem taskId");
      return NextResponse.json({ error: "Missing task_id" }, { status: 200 });
    }
  } catch (error) {
    console.error("Erro processando webhook:", error.message);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
