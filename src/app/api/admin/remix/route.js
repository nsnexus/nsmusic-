import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { getSupabaseEdge } from '@/lib/supabase-edge';
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
    return NextResponse.json(
      { error: 'Configuração ausente: KIE_API_KEY não definida no servidor.' },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { action } = body;

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

      // Se concluído, sincroniza no histórico
      if (finalStatus === 'SUCCESS' && rawTracks.length > 0) {
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
                    completedAt: new Date().toISOString()
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

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/remix] Erro geral na rota:', err?.message);
    return NextResponse.json({ error: err?.message || 'Erro ao processar remix.' }, { status: 500 });
  }
}
