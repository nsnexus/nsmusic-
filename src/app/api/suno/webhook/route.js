import { NextResponse } from 'next/server';
import { getTask, updateTaskResult } from '@/lib/db';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { maybeAutoRetrySunoFailure } from '@/lib/suno';

export const runtime = 'edge';

function getEnvSecret(env, name) {
  try {
    const ctx = getRequestContext();
    if (ctx?.env?.[name]) return String(ctx.env[name]).trim();
  } catch (e) {}
  return String(env?.[name] || process.env[name] || '').trim();
}

async function verifyUnificallySignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;
  // Tolerância de 5 minutos contra replay
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const dataToSign = enc.encode(`${timestamp}.${rawBody}`);
    const signatureBytes = await crypto.subtle.sign('HMAC', key, dataToSign);
    const expectedHex = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return expectedHex.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.warn('[Webhook Unifically] Erro ao validar HMAC:', err.message);
    return false;
  }
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const rawBody = await req.text();
    const { searchParams } = new URL(req.url);
    const unifSignature = req.headers.get('x-webhook-signature');
    const unifTimestamp = req.headers.get('x-webhook-timestamp');
    const unifSecret = getEnvSecret(env, 'UNIFICALLY_WEBHOOK_SECRET');

    const isUnifRequest = searchParams.get('provider') === 'unifically' || Boolean(unifSignature);

    if (isUnifRequest) {
      if (unifSignature && unifSecret) {
        const isValid = await verifyUnificallySignature(rawBody, unifSignature, unifTimestamp, unifSecret);
        if (!isValid) {
          console.warn('[Webhook Unifically] Assinatura HMAC inválida — notificação rejeitada.');
          return NextResponse.json({ error: 'unauthorized_signature' }, { status: 401 });
        }
      } else if (unifSecret && !unifSignature) {
        console.warn('[Webhook Unifically] Assinatura ausente e UNIFICALLY_WEBHOOK_SECRET configurado — notificação rejeitada.');
        return NextResponse.json({ error: 'missing_signature' }, { status: 401 });
      } else {
        console.warn('[Webhook Unifically] UNIFICALLY_WEBHOOK_SECRET não configurado — aceitando sem validação.');
      }
    } else {
      // Verificação Kie.ai (query param ?secret=...)
      const kieExpectedSecret = getEnvSecret(env, 'KIE_WEBHOOK_SECRET');
      if (kieExpectedSecret) {
        const providedSecret = searchParams.get('secret') || '';
        if (providedSecret !== kieExpectedSecret) {
          console.warn('[Webhook Kie.ai] Segredo ausente ou inválido — notificação rejeitada.');
          return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
      } else {
        console.warn('[Webhook Kie.ai] KIE_WEBHOOK_SECRET não configurado — aceitando sem autenticação.');
      }
    }

    let data;
    try {
      data = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('[Webhook Suno] Erro ao decodificar JSON do payload:', parseErr.message);
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const taskId = data.taskId || data.task_id || data.id || (data.data && (data.data.taskId || data.data.task_id));
    console.log('[Webhook Suno] Notificação recebida:', { taskId, status: data.status });

    if (!taskId) {
      console.error('[Webhook Suno] Webhook recebido sem taskId');
      return NextResponse.json({ error: 'Missing task_id' }, { status: 200 });
    }

    // Se o webhook reporta falha direta (ex: Unifically com status="failed"):
    if (data.status === 'failed') {
      console.warn(`[Webhook Suno] Tarefa ${taskId} falhou no provedor:`, data.error_message);
      const task = await getTask(taskId, env);
      const orderId = task?.orderId || null;
      if (orderId) {
        await maybeAutoRetrySunoFailure({
          taskId,
          orderId,
          env,
          reason: `webhook_failed_${data.error_message || 'unknown'}`
        });
      }
      return NextResponse.json({ success: true, handled: 'failed_retry_initiated' }, { status: 200 });
    }

    // Salva no banco e garante a entrega da notificação de WhatsApp antes de finalizar
    await updateTaskResult(taskId, data, null, env);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('[Webhook Suno] Erro processando webhook:', error.message);
    return NextResponse.json({ error: error.message }, { status: 200 });
  }
}
