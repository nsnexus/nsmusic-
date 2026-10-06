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
          callBackUrl: 'https://nsmusic.nsnexus.com.br/api/suno/webhook',
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
        voice_url: verifyUrl,
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
          callBackUrl: 'https://nsmusic.nsnexus.com.br/api/suno/webhook',
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
      const {
        voiceId,
        accountId: clientAccountId,
        voiceRecordingId: clientVoiceRecordingId,
        phraseTaskId: clientPhraseTaskId,
        prompt,
        style = 'Acoustic Pop',
        title = 'Música Teste com Voz'
      } = body;

      if (!voiceId || !prompt) {
        return NextResponse.json({ error: 'voiceId e prompt (letra) são obrigatórios.' }, { status: 400 });
      }

      let effectivePersonaId = voiceId;
      let effectiveAccountId = clientAccountId || null;
      let effectiveVoiceRecord = clientVoiceRecordingId || null;

      // Se voiceId for um taskId de 32 chars (ou se faltar accountId/voiceRecord), consulta a Kie.ai
      const tasksToInspect = [voiceId, clientPhraseTaskId].filter(t => t && typeof t === 'string' && t.length === 32 && !t.includes('-'));
      for (const tId of tasksToInspect) {
        try {
          const subRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(tId)}`, {
            headers: {
              'Authorization': `Bearer ${kieApiKey}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(6000)
          });
          if (subRes.ok) {
            const subData = await subRes.json();
            const subRaw = subData?.data?.resultJson || subData?.resultJson;
            let subParsed = null;
            if (subRaw) {
              try { subParsed = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw; } catch (e) {}
            }
            const pools = [subParsed?.data, subParsed, subData?.data, subData].filter(Boolean);
            for (const p of pools) {
              if (p.persona_id && typeof p.persona_id === 'string' && p.persona_id.includes('-')) {
                effectivePersonaId = p.persona_id;
              }
              if (!effectiveAccountId) {
                effectiveAccountId = p.suno_user_id || p.persona_voice_user_id || p.account_id || p.accountId || null;
              }
              if (!effectiveVoiceRecord) {
                effectiveVoiceRecord = p.voice_recording_id || p.voice_record_id || p.voice_record || p.voiceRecord || null;
              }
            }
          }
        } catch (e) {
          console.warn('[voice/task] Falha ao inspecionar tarefa para parâmetros de voz:', e.message);
        }
      }

      // Fallbacks com base no usuário ativo na Kie.ai se ainda não foram resolvidos
      if (!effectiveAccountId) effectiveAccountId = '70147233';
      if (!effectiveVoiceRecord) effectiveVoiceRecord = 'b4fa71e2-b681-4b1c-97f7-812a9ed0effa';

      if (!effectivePersonaId) effectivePersonaId = '706e6d15-3830-47dd-8cdf-f7635defb8d6';

      const generatePayload = {
        prompt: prompt,
        customMode: true,
        instrumental: false,
        model: 'V6',
        style: style,
        title: title.substring(0, 80),
        callBackUrl: 'https://nsmusic.nsnexus.com.br/api/suno/webhook',
        personaId: effectivePersonaId,
        voiceId: effectivePersonaId,
        persona_id: effectivePersonaId,
        persona_model: 'voice_persona',
        account_id: String(effectiveAccountId),
        accountId: String(effectiveAccountId),
        suno_user_id: String(effectiveAccountId),
        persona_voice_user_id: Number(effectiveAccountId) || String(effectiveAccountId),
        voice_record: String(effectiveVoiceRecord),
        voice_record_id: String(effectiveVoiceRecord),
        voice_recording_id: String(effectiveVoiceRecord),
        voiceRecord: String(effectiveVoiceRecord),
        voiceRecordingId: String(effectiveVoiceRecord),
        styleWeight: 0.85,
        weirdnessConstraint: 0.20,
      };

      const res = await fetch('https://api.kie.ai/api/v1/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kieApiKey}`
        },
        body: JSON.stringify(generatePayload),
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

    // Extrai dados das diferentes camadas retornadas pela Kie.ai
    const searchTargets = [
      parsedResult?.data,
      parsedResult,
      data?.data?.response?.data,
      data?.data?.response,
      data?.data
    ].filter((t) => t && typeof t === 'object');

    let phrase = null;
    let verifyPhraseId = null;
    let voiceRecordingId = null;
    let voiceId = null;

    let personaId = null;

    for (const target of searchTargets) {
      if (!phrase) {
        phrase = target.verify_phrase_text
          || target.phrase
          || target.validation_phrase
          || target.validationPhrase
          || target.text
          || target.phrase_text
          || null;
      }
      if (!verifyPhraseId) {
        verifyPhraseId = target.verify_phrase_id
          || target.verifyPhraseId
          || null;
      }
      if (!voiceRecordingId) {
        voiceRecordingId = target.voice_recording_id
          || target.voiceRecordingId
          || null;
      }
      if (!personaId) {
        personaId = target.persona_id
          || target.personaId
          || null;
      }
      if (!voiceId) {
        voiceId = target.persona_id
          || target.personaId
          || target.voiceId
          || target.voice_id
          || (Array.isArray(target.resultUrls) && target.resultUrls[0] ? target.resultUrls[0] : null)
          || (typeof target.resultUrls === 'string' ? target.resultUrls : null)
          || target.resultUrl
          || (target.id && !target.task_id ? target.id : null)
          || null;
      }
    }

    if (!phrase) {
      for (const target of searchTargets) {
        for (const [k, v] of Object.entries(target)) {
          if ((k.toLowerCase().includes('phrase') || k.toLowerCase().includes('text')) && typeof v === 'string') {
            phrase = v;
            break;
          }
        }
        if (phrase) break;
      }
    }

    if (!voiceId) {
      for (const target of searchTargets) {
        for (const [k, v] of Object.entries(target)) {
          if ((k.toLowerCase().includes('voice') || k.toLowerCase().includes('persona')) && typeof v === 'string' && !v.startsWith('http') && v.length < 100) {
            voiceId = v;
            break;
          }
        }
        if (voiceId) break;
      }
    }

    if (!voiceId && jobState === 'success') {
      const urls = data?.data?.response?.resultUrls || parsedResult?.resultUrls || (Array.isArray(data?.data?.resultUrls) ? data.data.resultUrls : null);
      if (Array.isArray(urls) && urls[0]) {
        voiceId = urls[0];
      }
    }

    let accountId = null;
    for (const target of searchTargets) {
      if (!accountId) {
        accountId = target.suno_user_id
          || target.persona_voice_user_id
          || target.account_id
          || target.accountId
          || null;
      }
    }

    // Se voiceId for um taskId de 32 hexadecimais (ex: retornado por create-voice apontando para validation-phrase), busca o persona_id real
    if (voiceId && !voiceId.includes('-') && voiceId.length === 32 && kieApiKey) {
      try {
        const subRes = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(voiceId)}`, {
          headers: {
            'Authorization': `Bearer ${kieApiKey}`,
            'Content-Type': 'application/json'
          },
          signal: AbortSignal.timeout(6000)
        });
        if (subRes.ok) {
          const subData = await subRes.json();
          const subRaw = subData?.data?.resultJson || subData?.resultJson;
          let subParsed = null;
          if (subRaw) {
            try { subParsed = typeof subRaw === 'string' ? JSON.parse(subRaw) : subRaw; } catch (e) {}
          }
          const foundPersona = subParsed?.persona_id
            || subParsed?.data?.persona_id
            || subData?.data?.persona_id;
          if (foundPersona) {
            personaId = foundPersona;
            voiceId = foundPersona;
          }
          if (!accountId) {
            accountId = subParsed?.suno_user_id
              || subParsed?.persona_voice_user_id
              || subParsed?.account_id
              || subData?.data?.suno_user_id
              || null;
          }
        }
      } catch (subErr) {
        console.warn('[voice/task] Não foi possível inspecionar sub-tarefa:', subErr.message);
      }
    }

    const finalVoiceId = personaId || voiceId || null;

    return NextResponse.json({
      ok: true,
      state: jobState,
      progress: data?.data?.progress || data?.progress || 0,
      failMsg: data?.data?.failMsg || data?.failMsg || null,
      parsedResult,
      phrase,
      verifyPhraseId,
      voiceRecordingId,
      accountId: accountId || '70147233',
      personaId: personaId || finalVoiceId,
      voiceId: finalVoiceId,
      raw: data
    });
  } catch (err) {
    console.error('[voice/task] Erro ao consultar status:', err.message);
    return NextResponse.json({ error: err.message || 'Erro ao consultar status.' }, { status: 500 });
  }
}
