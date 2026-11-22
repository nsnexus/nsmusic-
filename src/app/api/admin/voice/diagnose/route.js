import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getOrder } from '@/lib/supabaseDb';
import { getTask } from '@/lib/db';
import { readEnvValue } from '@/lib/envValue';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const noStore = { 'Cache-Control': 'no-store' };

// Diagnóstico seguro: consulta GRATUITA check-voice da KIE. Nunca gera uma música,
// nunca modifica o pedido e nunca expõe a KIE_API_KEY ao navegador.
export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: noStore });

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
    if (!orderId || orderId.length > 150) {
      return NextResponse.json({ error: 'Informe um pedido válido.' }, { status: 400, headers: noStore });
    }
    const order = await getOrder(orderId, env);
    if (!order) return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404, headers: noStore });

    const voiceId = order.customVoiceId || order.extras?.customVoiceId;
    if (typeof voiceId !== 'string' || !voiceId.trim()) {
      return NextResponse.json({
        ok: true, voiceAvailable: null, voiceIdSuffix: null, willUseClonedVoice: false,
        reason: 'O pedido não possui um Voice ID vinculado.',
        lastGeneration: 'unknown',
      }, { headers: noStore });
    }

    const explicitDisabled = order.isCustomVoice === false || order.extras?.isCustomVoice === false;
    const markedAsVoice = order.isCustomVoice === true || order.voiceType === 'minha_voz' || order.extras?.isCustomVoice === true;
    const selectedNow = body.useCustomVoice === true;
    const willUseClonedVoice = selectedNow && !explicitDisabled && markedAsVoice;
    const reason = !selectedNow
      ? 'A opção de usar voz clonada está desmarcada na tela.'
      : explicitDisabled
        ? 'Há um campo isCustomVoice=false salvo no pedido, mesmo com a caixa marcada. O servidor não aplicaria a clonagem.'
        : !markedAsVoice
          ? 'O pedido tem Voice ID, mas não está marcado como pedido de voz personalizada.'
          : 'O pedido está configurado para enviar a voz clonada à KIE.';

    let lastGeneration = 'unknown';
    if (order.sunoTaskId) {
      try {
        const task = await getTask(order.sunoTaskId, env);
        if (task?.result?.kieTaskApi === 'jobs') lastGeneration = 'jobs';
      } catch { /* diagnóstico opcional; não altera o resultado */ }
    }

    const key = readEnvValue(env, 'KIE_API_KEY');
    if (!key) return NextResponse.json({
      ok: false, voiceIdSuffix: voiceId.slice(-8), willUseClonedVoice, reason,
      lastGeneration, error: 'A KIE_API_KEY não está configurada neste ambiente.',
    }, { status: 503, headers: noStore });

    // Documentação atual: POST /api/v1/jobs/createTask com ai-music-api/check-voice;
    // resposta síncrona data.isAvailable; custo zero.
    const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'ai-music-api/check-voice', input: { task_id: voiceId } }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    const available = data?.data?.isAvailable;
    if (!res.ok || Number(data.code) !== 200 || typeof available !== 'boolean') {
      // A KIE pode devolver 422 temporariamente após criar a voz: não interpretar como inválida.
      const temporary = Number(data.code) === 422 && /suno_user_id is missing/i.test(String(data.msg || ''));
      return NextResponse.json({
        ok: false, voiceAvailable: null, voiceIdSuffix: voiceId.slice(-8),
        willUseClonedVoice, reason, lastGeneration, temporarilyUnavailable: temporary,
        error: temporary
          ? 'A KIE ainda não concluiu a indexação da voz. Repita a verificação.'
          : `A KIE não confirmou a disponibilidade da voz (código ${data.code || res.status}).`,
      }, { status: 502, headers: noStore });
    }

    return NextResponse.json({
      ok: true, voiceAvailable: available, voiceIdSuffix: voiceId.slice(-8),
      willUseClonedVoice, reason, lastGeneration,
      message: available
        ? 'A KIE confirmou que este Voice ID está disponível. Isso não garante semelhança do timbre na música.'
        : 'A KIE informou que este Voice ID não está disponível. Confirme se foi usado o ID da tarefa de frase de verificação.',
    }, { headers: noStore });
  } catch (err) {
    console.error('[admin/voice/diagnose] Falha de diagnóstico:', err?.message);
    return NextResponse.json({ error: 'Falha ao consultar a disponibilidade da voz na KIE.' }, { status: 502, headers: noStore });
  }
}
