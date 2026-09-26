import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder, updateOrder } from '@/lib/supabaseDb';
import { extractAudioTracks } from '@/lib/db';
import { readEnvValue } from '@/lib/envValue';
import { audioUrlSaudavel } from '@/lib/audioUrlSaudavel';
import { isOurStorage } from '@/lib/audioArchive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const DOMINIOS_EFEMEROS = ['audiostream.kie.ai', 'musicfile.kie.ai'];

function urlEfemera(u) {
  return typeof u === 'string' && DOMINIOS_EFEMEROS.some((d) => u.includes(d));
}

function precisaTrocar(order) {
  const urls = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])];
  return urls.some(urlEfemera);
}

async function resolverTaskId(order, orderId, env = {}) {
  if (order?.sunoTaskId) return order.sunoTaskId;
  try {
    const { getSupabaseEdge } = await import('@/lib/supabase-edge');
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      const { data } = await supabase.from('suno_tasks').select('id').eq('order_id', orderId).limit(1).maybeSingle();
      if (data?.id) return data.id;
    }
  } catch (err) {
    console.warn('[promote-audio] Falha ao buscar taskId:', err.message);
  }
  return '';
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.orderId || '').trim();
    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório' }, { status: 400 });
    }

    const apiKey = readEnvValue(env, 'KIE_API_KEY');
    if (!apiKey) {
      console.error('[promote-audio] KIE_API_KEY não configurada.');
      return NextResponse.json({ error: 'Configuração ausente no servidor.' }, { status: 500 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    // Já está com URL definitiva (o cron chegou antes, ou o áudio já foi arquivado): nada a fazer.
    if (!precisaTrocar(order)) {
      return NextResponse.json({ ok: true, estado: 'ja_definitiva' });
    }

    const taskId = await resolverTaskId(order, orderId, env);
    if (!taskId) {
      return NextResponse.json({ ok: false, estado: 'sem_task' });
    }

    const res = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, estado: 'consulta_falhou' });
    }

    const data = await res.json().catch(() => null);
    const tracks = data ? extractAudioTracks(data) : [];
    const definitivas = tracks.filter((t) => t.audio_url && !urlEfemera(t.audio_url));

    if (definitivas.length === 0) {
      return NextResponse.json({ ok: false, estado: 'ainda_processando' });
    }

    const saude = await Promise.all(definitivas.map((t) => audioUrlSaudavel(t.audio_url)));
    const prontas = definitivas.filter((_, i) => saude[i]);

    const faixasAtuais = Array.isArray(order.audioFiles) ? order.audioFiles.filter(Boolean).length : (order.audioUrl ? 1 : 0);
    if (prontas.length === 0 || prontas.length < faixasAtuais) {
      return NextResponse.json({ ok: false, estado: 'definitiva_ainda_nao_serve', prontas: prontas.length, atuais: faixasAtuais });
    }

    const atuais = Array.isArray(order.audioFiles) && order.audioFiles.length
      ? order.audioFiles.filter(Boolean)
      : [order.audioUrl].filter(Boolean);
    const audioFiles = prontas.map((t, i) => (isOurStorage(atuais[i]) ? atuais[i] : t.audio_url));
    const audioIds = prontas.map((t) => t.trackId).filter(Boolean);

    const updates = {
      audioUrl: audioFiles[0],
      audioFiles,
      audioRefreshedAt: new Date().toISOString(),
      audioRefreshFailed: null,
      updatedAt: new Date().toISOString(),
    };
    if (audioIds.length > 0) updates.audioIds = audioIds;
    if (!order.sunoTaskId) updates.sunoTaskId = taskId;

    await updateOrder(orderId, updates, env);

    // Dispara arquivamento imediato para R2 se disponível
    try {
      const { arquivarAudioDoPedido } = await import('@/lib/audioArchive');
      await arquivarAudioDoPedido({ orderId, env });
    } catch {}

    return NextResponse.json({ ok: true, estado: 'trocada', audioFiles });
  } catch (error) {
    console.error('[promote-audio] Erro:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar o áudio.' }, { status: 500 });
  }
}
