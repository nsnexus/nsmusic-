import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { extractAudioTracks } from '@/lib/db';
import { transcribeAudioWithFailover } from '@/lib/transcribeAudio';
import { copyAudioToR2, isOurStorage } from '@/lib/audioArchive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

async function archiveRemixTracksToR2(taskId, tracks, env) {
  if (!Array.isArray(tracks) || tracks.length === 0) return tracks;
  let envToUse = env;
  if (!envToUse || !envToUse.nsmusic_media) {
    try {
      const ctx = getRequestContext();
      if (ctx?.env) envToUse = ctx.env;
    } catch (e) {}
  }
  const r2Bucket = envToUse?.nsmusic_media;
  const r2PublicUrl = String(readEnvValue(envToUse, 'R2_PUBLIC_URL') || '').trim();
  if (!r2Bucket || !r2PublicUrl) return tracks;

  const updatedTracks = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = { ...tracks[i] };
    const sourceUrl = track.audio_url || track.audioUrl || track.url;
    if (sourceUrl && !isOurStorage(sourceUrl)) {
      try {
        const destPath = `remix/${taskId}/versao-${i + 1}.mp3`;
        const copy = await copyAudioToR2(sourceUrl, destPath, r2Bucket, r2PublicUrl);
        if (copy.ok && copy.url) {
          track.audio_url = copy.url;
          track.original_audio_url = sourceUrl;
          track.savedToR2 = true;
        }
      } catch (err) {
        console.warn(`[remix/archive] Erro ao arquivar faixa ${i + 1} no R2:`, err?.message);
      }
    } else if (sourceUrl && isOurStorage(sourceUrl)) {
      track.savedToR2 = true;
    }
    updatedTracks.push(track);
  }
  return updatedTracks;
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const body = await req.json();
    const { action } = body;

    // 0. Transcrever / Identificar letra do áudio com IA (Whisper + Gemini)
    if (action === 'transcribe') {
      const { audioUrl } = body;
      if (!audioUrl || typeof audioUrl !== 'string') {
        return NextResponse.json({ error: 'audioUrl é obrigatória para transcrever a letra.' }, { status: 400 });
      }

      const envVars = {
        ...process.env,
        ...env,
        OPENAI_API_KEY: readEnvValue(env, 'OPENAI_API_KEY'),
        GEMINI_API_KEY: readEnvValue(env, 'GEMINI_API_KEY'),
        GEMINI_API_KEYS: readEnvValue(env, 'GEMINI_API_KEYS')
      };

      const rawText = await transcribeAudioWithFailover({ type: 'url', value: audioUrl.trim() }, envVars);
      if (!rawText || !rawText.trim()) {
        return NextResponse.json({
          ok: false,
          lyrics: '',
          message: 'Não foi possível identificar voz cantada audível neste áudio. Você pode digitar a letra manualmente.'
        });
      }

      // Formata como versos de letra se estiver tudo em poucas linhas corridas
      let formatted = rawText.trim();
      const lineCount = formatted.split('\n').filter(Boolean).length;
      if (lineCount <= 2) {
        formatted = formatted
          .replace(/([.!?])\s+/g, '$1\n')
          .replace(/(,\s+)/g, ',\n')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean)
          .join('\n');
      }

      return NextResponse.json({
        ok: true,
        lyrics: formatted,
        rawText
      });
    }

    const kieApiKey = readEnvValue(env, 'KIE_API_KEY');
    if (!kieApiKey) {
      return NextResponse.json(
        { error: 'Configuração ausente: KIE_API_KEY não definida no servidor.' },
        { status: 500 }
      );
    }

    // 1. Criar tarefa de Remix / Cover
    if (action === 'create') {
      const {
        uploadUrl,
        style = 'Acoustic Pop, studio vocals',
        title = 'Remix Suno IA',
        model = 'V5_5',
        prompt = '',
        instrumental = false,
        vocalGender = ''
      } = body;

      if (!uploadUrl || typeof uploadUrl !== 'string') {
        return NextResponse.json(
          { error: 'uploadUrl é obrigatória (URL pública do áudio original no R2).' },
          { status: 400 }
        );
      }

      const inputPayload = {
        model: String(model || 'V5_5'),
        upload_url: uploadUrl.trim(),
        style: String(style || 'Acoustic Pop').slice(0, 1000),
        title: String(title || 'Remix Suno IA').slice(0, 100),
        instrumental: Boolean(instrumental)
      };

      if (!instrumental) {
        if (prompt && prompt.trim()) {
          inputPayload.prompt = prompt.trim().slice(0, 5000);
          inputPayload.lyrics = prompt.trim().slice(0, 5000);
        }
        if (vocalGender && (vocalGender === 'm' || vocalGender === 'f')) {
          inputPayload.vocal_gender = vocalGender;
        }
      }

      const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${kieApiKey}`
        },
        body: JSON.stringify({
          model: 'ai-music-api/upload-and-cover-audio',
          callBackUrl: 'https://nsmusic.nsnexus.com.br/api/suno/webhook',
          input: inputPayload
        }),
        signal: AbortSignal.timeout(15000)
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data.code && data.code !== 200)) {
        console.error('[remix/create] Erro Kie.ai ao criar remix:', res.status, data);
        return NextResponse.json(
          { error: data?.msg || data?.message || `Erro da Kie.ai (HTTP ${res.status})` },
          { status: res.status || 502 }
        );
      }

      const taskId = data?.data?.taskId || data?.data?.task_id || data?.taskId;
      if (!taskId) {
        return NextResponse.json({ error: 'Kie.ai não retornou o taskId da tarefa.' }, { status: 502 });
      }

      // Salva no histórico de remixes
      const supabase = getSupabaseEdge(env);
      if (supabase) {
        try {
          const cfgRes = await supabase.from('config').select('valor').eq('chave', 'remix_history').limit(1);
          let history = [];
          if (cfgRes?.data?.[0]?.valor && Array.isArray(cfgRes.data[0].valor)) {
            history = cfgRes.data[0].valor;
          }

          const newItem = {
            taskId,
            title: inputPayload.title,
            style: inputPayload.style,
            uploadUrl,
            instrumental: inputPayload.instrumental,
            model: inputPayload.model,
            vocalGender: vocalGender || 'auto',
            lyrics: inputPayload.lyrics || inputPayload.prompt || '',
            status: 'PROCESSING',
            tracks: [],
            createdAt: new Date().toISOString()
          };

          const updatedHistory = [newItem, ...history].slice(0, 50);
          await supabase.from('config').upsert({
            chave: 'remix_history',
            valor: updatedHistory,
            updated_at: new Date().toISOString()
          });
        } catch (dbErr) {
          console.warn('[remix/create] Falha ao salvar no histórico:', dbErr?.message);
        }
      }

      return NextResponse.json({
        ok: true,
        taskId,
        item: {
          taskId,
          title: inputPayload.title,
          style: inputPayload.style,
          uploadUrl,
          model: inputPayload.model,
          lyrics: inputPayload.lyrics || inputPayload.prompt || '',
          status: 'PROCESSING'
        }
      });
    }

    // 2. Consultar status e faixas geradas do Remix
    if (action === 'status') {
      const { taskId } = body;
      if (!taskId) {
        return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
      }

      let res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
        headers: {
          Authorization: `Bearer ${kieApiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      });

      let data = await res.json().catch(() => ({}));
      let rawTracks = [];

      const jobState = String(data?.data?.state || data?.state || '').toLowerCase();
      let isCompleted = jobState === 'success' || jobState === 'completed';
      let isFailed = jobState === 'fail' || jobState === 'failed' || jobState === 'error';

      // Tenta extrair faixas do job
      if (data?.data?.resultJson) {
        try {
          const parsed = typeof data.data.resultJson === 'string' ? JSON.parse(data.data.resultJson) : data.data.resultJson;
          rawTracks = extractAudioTracks(parsed);
        } catch (e) {}
      }

      if (rawTracks.length === 0) {
        rawTracks = extractAudioTracks(data);
      }

      // Se ainda não tiver faixas pelo jobs/recordInfo, tenta também generate/record-info (formato padrão Suno da Kie)
      if (rawTracks.length === 0) {
        try {
          const genRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
            headers: {
              Authorization: `Bearer ${kieApiKey}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
          });
          if (genRes.ok) {
            const genData = await genRes.json().catch(() => ({}));
            const genState = String(genData?.data?.status || genData?.status || '').toUpperCase();
            if (genState === 'SUCCESS' || genState === 'COMPLETED') {
              isCompleted = true;
            } else if (genState === 'FAILED' || genState === 'ERROR') {
              isFailed = true;
            }
            const foundTracks = extractAudioTracks(genData);
            if (foundTracks.length > 0) {
              rawTracks = foundTracks;
            }
          }
        } catch (e) {}
      }

      const finalStatus = rawTracks.length > 0 || isCompleted ? 'SUCCESS' : (isFailed ? 'FAILED' : 'PROCESSING');

      // Se concluído, arquiva as faixas no Cloudflare R2 e sincroniza no histórico
      if (finalStatus === 'SUCCESS' && rawTracks.length > 0) {
        rawTracks = await archiveRemixTracksToR2(taskId, rawTracks, env);

        const supabase = getSupabaseEdge(env);
        if (supabase) {
          try {
            const cfgRes = await supabase.from('config').select('valor').eq('chave', 'remix_history').limit(1);
            if (cfgRes?.data?.[0]?.valor && Array.isArray(cfgRes.data[0].valor)) {
              const updated = cfgRes.data[0].valor.map(item => {
                if (item.taskId === taskId) {
                  return {
                    ...item,
                    status: 'SUCCESS',
                    tracks: rawTracks,
                    completedAt: item.completedAt || new Date().toISOString()
                  };
                }
                return item;
              });
              await supabase.from('config').upsert({
                chave: 'remix_history',
                valor: updated,
                updated_at: new Date().toISOString()
              });
            }
          } catch (e) {}
        }
      }

      return NextResponse.json({
        ok: true,
        taskId,
        state: jobState,
        status: finalStatus,
        tracks: rawTracks,
        raw: data
      });
    }

    // 3. Obter Histórico de Remixes
    if (action === 'history') {
      const supabase = getSupabaseEdge(env);
      if (!supabase) return NextResponse.json({ ok: true, history: [] });

      try {
        const res = await supabase.from('config').select('valor').eq('chave', 'remix_history').limit(1);
        const history = (res?.data?.[0]?.valor && Array.isArray(res.data[0].valor)) ? res.data[0].valor : [];
        return NextResponse.json({ ok: true, history });
      } catch (err) {
        return NextResponse.json({ ok: true, history: [] });
      }
    }

    // 4. Arquivar faixas pendentes no Cloudflare R2 manualmente
    if (action === 'archive') {
      const { taskId } = body;
      if (!taskId) {
        return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
      }

      const supabase = getSupabaseEdge(env);
      if (!supabase) return NextResponse.json({ error: 'Banco de dados indisponível' }, { status: 503 });

      const cfgRes = await supabase.from('config').select('valor').eq('chave', 'remix_history').limit(1);
      const history = (cfgRes?.data?.[0]?.valor && Array.isArray(cfgRes.data[0].valor)) ? cfgRes.data[0].valor : [];
      const itemIndex = history.findIndex(it => it.taskId === taskId);

      if (itemIndex === -1) {
        return NextResponse.json({ error: 'Remix não encontrado no histórico.' }, { status: 404 });
      }

      const item = history[itemIndex];
      let tracks = Array.isArray(item.tracks) ? item.tracks : [];

      if (tracks.length === 0) {
        try {
          const genRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
            headers: {
              Authorization: `Bearer ${kieApiKey}`,
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
          });
          if (genRes.ok) {
            const genData = await genRes.json().catch(() => ({}));
            tracks = extractAudioTracks(genData);
          }
        } catch (e) {}
      }

      const archivedTracks = await archiveRemixTracksToR2(taskId, tracks, env);
      const updatedItem = {
        ...item,
        status: archivedTracks.length > 0 ? 'SUCCESS' : item.status,
        tracks: archivedTracks,
        completedAt: item.completedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      history[itemIndex] = updatedItem;
      await supabase.from('config').upsert({
        chave: 'remix_history',
        valor: history,
        updated_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, item: updatedItem, tracks: archivedTracks });
    }

    // 5. Excluir Remix do Histórico
    if (action === 'delete') {
      const { taskId } = body;
      if (!taskId) {
        return NextResponse.json({ error: 'taskId é obrigatório.' }, { status: 400 });
      }

      const supabase = getSupabaseEdge(env);
      if (!supabase) return NextResponse.json({ error: 'Banco de dados indisponível' }, { status: 503 });

      const cfgRes = await supabase.from('config').select('valor').eq('chave', 'remix_history').limit(1);
      const history = (cfgRes?.data?.[0]?.valor && Array.isArray(cfgRes.data[0].valor)) ? cfgRes.data[0].valor : [];
      const filtered = history.filter(it => it.taskId !== taskId);

      await supabase.from('config').upsert({
        chave: 'remix_history',
        valor: filtered,
        updated_at: new Date().toISOString()
      });

      return NextResponse.json({ ok: true, history: filtered });
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/remix] Erro geral na rota:', err?.message);
    return NextResponse.json({ error: err?.message || 'Erro ao processar remix.' }, { status: 500 });
  }
}
