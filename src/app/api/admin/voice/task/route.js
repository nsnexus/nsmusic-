import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { extractAudioTracks } from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const kieApiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!kieApiKey) {
    return NextResponse.json({ error: 'Configuração ausente: KIE_API_KEY não definida no servidor.' }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // 1. Solicitar Frase de Validação
    if (action === 'request_phrase') {
      const { voiceUrl, vocalStart = 0, vocalEnd = 20, language = 'pt' } = body;
      if (!voiceUrl) {
        return NextResponse.json({ error: 'voiceUrl é obrigatório para solicitar a frase.' }, { status: 400 });
      }

      const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`
        },
        body: JSON.stringify({
          model: 'ai-music-api/validation-phrase',
          input: {
            voice_url: voiceUrl,
            vocal_start_s: Number(vocalStart) || 0,
            vocal_end_s: Number(vocalEnd) || 20,
            language: String(language || 'pt')
          }
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code && data.code !== 200)) {
        console.error('[voice/task] Erro ao criar tarefa de validação na Kie.ai:', res.status, data);
        return NextResponse.json({
          error: data?.msg || data?.message || `Erro da Kie.ai (HTTP ${res.status})`
        }, { status: res.status || 502 });
      }

      const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId;
      return NextResponse.json({ ok: true, taskId, raw: data });
    }

    // 2. Criar Perfil de Voz com a gravação da validação
    if (action === 'create_voice') {
      const {
        phraseTaskId,
        verifyUrl,
        voiceName = 'Voz do Cliente',
        description = 'Voz personalizada',
        style = 'acoustic',
        verifyPhraseId,
        voiceRecordingId
      } = body;

      if (!phraseTaskId && !verifyPhraseId) {
        return NextResponse.json({ error: 'phraseTaskId ou verifyPhraseId é obrigatório.' }, { status: 400 });
      }
      if (!verifyUrl) {
        return NextResponse.json({ error: 'verifyUrl é obrigatório.' }, { status: 400 });
      }

      const inputPayload = {
        task_id: phraseTaskId || verifyPhraseId,
        verify_url: verifyUrl,
        voice_name: voiceName,
        description: description,
        style: style
      };
      if (verifyPhraseId) inputPayload.verify_phrase_id = verifyPhraseId;
      if (voiceRecordingId) inputPayload.voice_recording_id = voiceRecordingId;

      const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`
        },
        body: JSON.stringify({
          model: 'ai-music-api/create-voice',
          input: inputPayload
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code && data.code !== 200)) {
        console.error('[voice/task] Erro ao criar voz na Kie.ai:', res.status, data);
        return NextResponse.json({
          error: data?.msg || data?.message || `Erro da Kie.ai (HTTP ${res.status})`
        }, { status: res.status || 502 });
      }

      const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId;
      return NextResponse.json({ ok: true, taskId, raw: data });
    }

    // 3. Gerar Canção com a Voz Criada (voiceId / personaId)
    if (action === 'generate_song') {
      const { voiceId, prompt, style = 'Acoustic Pop', title = 'Música Teste com Voz' } = body;
      if (!voiceId || !prompt) {
        return NextResponse.json({ error: 'voiceId e prompt (letra) são obrigatórios.' }, { status: 400 });
      }

      const res = await fetch('https://api.kie.ai/api/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`
        },
        body: JSON.stringify({
          prompt: prompt,
          customMode: true,
          instrumental: false,
          model: 'V6',
          style: style,
          title: title.substring(0, 80),
          personaId: voiceId,
          voiceId: voiceId
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code && data.code !== 200)) {
        console.error('[voice/task] Erro ao gerar música com voz na Kie.ai:', res.status, data);
        return NextResponse.json({
          error: data?.msg || data?.message || `Erro da Kie.ai (HTTP ${res.status})`
        }, { status: res.status || 502 });
      }

      const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId;
      return NextResponse.json({ ok: true, taskId, raw: data });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[voice/task] Exceção na requisição:', err.message);
    return NextResponse.json({ error: err.message || 'Erro interno ao processar tarefa.' }, { status: 500 });
  }
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const kieApiKey = readEnvValue(env, 'KIE_API_KEY');
  if (!kieApiKey) {
    return NextResponse.json({ error: 'Configuração ausente: KIE_API_KEY não definida.' }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  const type = searchParams.get('type') || 'job'; // 'job' (createTask) ou 'generate' (música)

  if (!taskId) {
    return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
  }

  try {
    // Consulta status de geração de música
    if (type === 'generate') {
      const res = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
          'Authorization': `Bearer ${kieApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!res.ok) {
        return NextResponse.json({ error: `Kie.ai HTTP ${res.status}` }, { status: res.status });
      }

      const data = await res.json();
      const tracks = extractAudioTracks(data);

      const rawStatus = String(
        (Array.isArray(data?.data) ? data.data[0]?.status : (data?.data?.status || data?.data?.state))
        || data?.status
        || data?.state
        || ''
      ).toUpperCase();

      const isCompleted = rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE') || tracks.length > 0;
      const isFailed = rawStatus.includes('FAIL') || rawStatus.includes('ERROR');

      return NextResponse.json({
        ok: true,
        status: isCompleted ? 'COMPLETED' : (isFailed ? 'FAILED' : 'PROCESSING'),
        rawStatus,
        tracks,
        raw: data
      });
    }

    // Consulta status de job genérico (validation-phrase ou create-voice)
    const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
      headers: {
        'Authorization': `Bearer ${kieApiKey}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Kie.ai HTTP ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const jobState = String(data?.data?.state || data?.state || '').toLowerCase();

    let parsedResult = null;
    const rawResultJson = data?.data?.resultJson || data?.resultJson;
    if (rawResultJson) {
      try {
        parsedResult = typeof rawResultJson === 'string' ? JSON.parse(rawResultJson) : rawResultJson;
      } catch (e) {
        parsedResult = { raw: rawResultJson };
      }
    }

    // Extrai frase de validação caso seja a tarefa de validação
    let phrase = parsedResult?.verify_phrase_text
      || parsedResult?.phrase
      || parsedResult?.validation_phrase
      || parsedResult?.validationPhrase
      || parsedResult?.text
      || parsedResult?.phrase_text
      || data?.data?.verify_phrase_text
      || data?.data?.phrase
      || data?.data?.validation_phrase
      || data?.data?.validationPhrase
      || data?.phrase
      || null;

    if (!phrase && parsedResult && typeof parsedResult === 'object') {
      for (const [k, v] of Object.entries(parsedResult)) {
        if ((k.toLowerCase().includes('phrase') || k.toLowerCase().includes('text')) && typeof v === 'string') {
          phrase = v;
          break;
        }
      }
    }

    const verifyPhraseId = parsedResult?.verify_phrase_id || data?.data?.verify_phrase_id || null;
    const voiceRecordingId = parsedResult?.voice_recording_id || data?.data?.voice_recording_id || null;

    // Extrai o voiceId caso seja a tarefa de criação de voz
    let voiceId = parsedResult?.voiceId
      || parsedResult?.voice_id
      || parsedResult?.personaId
      || parsedResult?.persona_id
      || parsedResult?.id
      || data?.data?.voiceId
      || data?.data?.voice_id
      || data?.data?.personaId
      || data?.voiceId
      || null;

    if (!voiceId && parsedResult && typeof parsedResult === 'object') {
      for (const [k, v] of Object.entries(parsedResult)) {
        if ((k.toLowerCase().includes('voice') || k.toLowerCase().includes('persona')) && typeof v === 'string') {
          voiceId = v;
          break;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      state: jobState,
      progress: data?.data?.progress || data?.progress || 0,
      failMsg: data?.data?.failMsg || data?.failMsg || null,
      parsedResult,
      phrase,
      verifyPhraseId,
      voiceRecordingId,
      voiceId,
      raw: data
    });
  } catch (err) {
    console.error('[voice/task] Erro ao consultar status:', err.message);
    return NextResponse.json({ error: err.message || 'Erro ao consultar status.' }, { status: 500 });
  }
}
