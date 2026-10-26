import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { extractAudioTracks, saveTask, getTask, updateTaskResult } from '@/lib/db';
import { resolverSiteUrl } from '@/lib/siteUrl';
import { updateOrder } from '@/lib/supabaseDb';
import { readKieJob, readKieSongTracks, buildVoiceSongPayload } from '@/lib/kieVoice';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function getEnv() {
  try { return getRequestContext()?.env || {}; } catch { return {}; }
}

async function kieRequest(path, apiKey, body) {
  const response = await fetch(`https://api.kie.ai/api/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (data.code !== undefined && Number(data.code) !== 200)) {
    const error = new Error(data.msg || data.message || 'Não foi possível consultar a IA de voz.');
    error.status = response.status === 429 ? 429 : 502;
    error.providerCode = Number(data.code || response.status);
    throw error;
  }
  return data;
}

const getJob = (taskId, key) => kieRequest(`jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, key);

export async function POST(req) {
  const env = getEnv();
  const key = readEnvValue(env, 'KIE_API_KEY');
  if (!key) return NextResponse.json({ error: 'Configuração de voz indisponível no servidor.' }, { status: 503 });
  try {
    const body = await req.json();
    let payload;
    if (body.action === 'request_phrase') {
      if (!body.voiceUrl) return NextResponse.json({ error: 'Envie a amostra de voz.' }, { status: 400 });
      payload = {
        model: 'ai-music-api/validation-phrase',
        input: { voice_url: body.voiceUrl, vocal_start_s: Number(body.vocalStart) || 0, vocal_end_s: Number(body.vocalEnd) || 20, language: body.language || 'pt' },
      };
    } else if (body.action === 'create_voice') {
      if (!body.phraseTaskId || !body.verifyUrl) return NextResponse.json({ error: 'A frase de validação e sua gravação são obrigatórias.' }, { status: 400 });
      payload = {
        model: 'ai-music-api/create-voice',
        input: { task_id: body.phraseTaskId, verify_url: body.verifyUrl, voice_name: body.voiceName || 'Voz do Cliente', description: body.description || 'Voz personalizada', style: body.style || 'acoustic' },
      };
    } else if (body.action === 'generate_song') {
      if (!body.voiceId || !body.prompt) return NextResponse.json({ error: 'Voz validada e letra são obrigatórias.' }, { status: 400 });
      // Current Voice IDs refer to the validation task, never its internal persona UUID.
      if (/^[a-f0-9]{32}$/i.test(body.voiceId)) {
        const voice = readKieJob(await getJob(body.voiceId, key));
        if (voice.state !== 'success') return NextResponse.json({ error: voice.failMsg || 'Sua voz ainda não concluiu a validação. Aguarde ou grave novamente.' }, { status: 409 });
      }
      const secret = readEnvValue(env, 'KIE_WEBHOOK_SECRET');
      const callback = `${resolverSiteUrl(readEnvValue(env, 'NEXT_PUBLIC_SITE_URL'))}/api/suno/webhook${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
      payload = buildVoiceSongPayload(body, callback);
    } else {
      return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
    }

    const data = await kieRequest('jobs/createTask', key, payload);
    const createdTaskId = data.data?.taskId || data.data?.task_id || data.taskId;
    if (!createdTaskId) throw new Error('A IA não retornou o identificador da tarefa. Tente novamente.');
    if (body.action === 'generate_song' && body.orderId) {
      await saveTask(createdTaskId, 'PROCESSING', { kieTaskApi: 'jobs' }, body.orderId, { provider: 'kie', customVoiceId: body.voiceId }, env);
      await updateOrder(body.orderId, {
        productionStatus: 'GERANDO_AUDIO', sunoTaskId: createdTaskId, sunoProvider: 'kie',
        customVoiceId: body.voiceId, isCustomVoice: true, voiceType: 'minha_voz',
        sunoRequestedAt: new Date().toISOString(), sunoError: null,
      }, env);
    }
    // Poll the ORIGINAL validation task, not the create-voice acknowledgement.
    return NextResponse.json({ ok: true, taskId: body.action === 'create_voice' ? body.phraseTaskId : createdTaskId, submissionTaskId: createdTaskId });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Erro ao processar voz.' }, { status: error.status || 502 });
  }
}

export async function GET(req) {
  const env = getEnv();
  const key = readEnvValue(env, 'KIE_API_KEY');
  if (!key) return NextResponse.json({ error: 'Configuração de voz indisponível no servidor.' }, { status: 503 });
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type') || 'job';
  if (!taskId) return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
  try {
    let data;
    try { data = await getJob(taskId, key); }
    catch (error) {
      // Preserve polling for songs submitted before the jobs API migration.
      if (type !== 'generate' || ![404, 422].includes(error.providerCode)) throw error;
      data = await kieRequest(`generate/record-info?taskId=${encodeURIComponent(taskId)}`, key);
    }
    let job = readKieJob(data);
    if (type === 'generate') {
      const tracks = extractAudioTracks({ data: readKieSongTracks(job) });
      const legacyTracks = tracks.length ? tracks : extractAudioTracks(data);
      const completed = ['success', 'completed', 'complete'].includes(job.state);
      const failed = /fail|error/.test(job.state);
      if (completed && legacyTracks.length) {
        const task = await getTask(taskId, env);
        if (task?.orderId) await updateTaskResult(taskId, { data: legacyTracks }, task.orderId, env);
      }
      return NextResponse.json({ ok: true, status: failed ? 'FAILED' : completed && legacyTracks.length ? 'COMPLETED' : 'PROCESSING', tracks: completed ? legacyTracks : [], failMsg: job.failMsg });
    }
    let voiceTaskId = taskId;
    // Old clients may still poll the acknowledgement: follow its validation task.
    if (job.model === 'ai-music-api/create-voice' && typeof job.linkedVoiceId === 'string') {
      voiceTaskId = job.linkedVoiceId;
      job = readKieJob(await getJob(voiceTaskId, key));
    }
    const ready = job.state === 'success';
    return NextResponse.json({
      ok: true, state: job.state, progress: job.progress, failMsg: job.failMsg,
      phrase: job.phrase, verifyPhraseId: job.verifyPhraseId,
      voiceRecordingId: job.voiceRecordingId, accountId: job.accountId,
      voiceId: ready ? voiceTaskId : null, personaId: ready ? voiceTaskId : null,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Erro ao consultar voz.' }, { status: error.status || 502 });
  }
}
