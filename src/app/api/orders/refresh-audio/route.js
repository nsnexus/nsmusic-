import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { updateOrder } from '@/lib/supabaseDb';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { extractAudioTracks } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { audioUrlSaudavel } from '@/lib/audioUrlSaudavel';
import { isOurStorage } from '@/lib/audioArchive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_ORDERS_PER_RUN = 12;
const MAX_SUSPEITOS_POR_RUN = 8;
const JANELA_SUSPEITA_MS = 48 * 60 * 60 * 1000;
const SCAN_LIMIT = 1000;
const RETRY_FAILED_AFTER_MS = 24 * 60 * 60 * 1000;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

async function authorize(req, env) {
  const expectedSecret = readEnv(env, 'CLEANUP_SECRET') || readEnv(env, 'RECONCILE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-cleanup-secret') || req.headers.get('x-reconcile-secret') || '';
    if (provided === expectedSecret) return { ok: true, via: 'secret' };
  }
  const admin = await requireAdmin(req, env);
  if (admin.ok) return { ok: true, via: 'admin' };
  return { ok: false, status: admin.status || 401, error: admin.error || 'Não autorizado.' };
}

const DOMINIOS_QUE_NAO_DURAM = ['musicfile.kie.ai', 'audiostream.kie.ai'];

function urlEfemera(u) {
  return typeof u === 'string' && DOMINIOS_QUE_NAO_DURAM.some((d) => u.includes(d));
}

function needsRefresh(order) {
  const urls = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])];
  return urls.some(urlEfemera);
}

function mesclarPreservandoNosso(novas, atuais) {
  const base = Array.isArray(atuais) ? atuais.filter(Boolean) : [];
  return novas.map((nova, i) => (isOurStorage(base[i]) ? base[i] : nova));
}

async function resolveTaskId(order, orderId, supabase) {
  if (order?.sunoTaskId) return order.sunoTaskId;
  if (!supabase) return '';
  try {
    const { data } = await supabase
      .from('suno_tasks')
      .select('id')
      .eq('order_id', orderId)
      .limit(1);

    if (data && data[0]) return data[0].id;
  } catch (err) {
    console.warn('[refresh-audio] Falha ao buscar taskId em suno_tasks:', err.message);
  }
  return '';
}

async function fetchFreshTracks(taskId, apiKey) {
  try {
    const res = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };

    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, reason: 'resposta_invalida' };

    const tracks = extractAudioTracks(data);
    const usable = tracks.filter((t) => t.audio_url && !urlEfemera(t.audio_url));
    if (usable.length === 0) return { ok: false, reason: 'sem_url_utilizavel' };

    const saude = await Promise.all(usable.map((t) => audioUrlSaudavel(t.audio_url)));
    const prontas = usable.filter((_, i) => saude[i]);
    if (prontas.length === 0) return { ok: false, reason: 'definitiva_ainda_nao_serve' };

    return { ok: true, tracks: prontas };
  } catch (err) {
    return { ok: false, reason: err?.message || 'erro_desconhecido' };
  }
}

function faixasNoPedido(data) {
  if (Array.isArray(data?.audioFiles)) return data.audioFiles.filter(Boolean).length;
  return data?.audioUrl ? 1 : 0;
}

function naoPodeGravar(tracks, data) {
  return tracks.length < faixasNoPedido(data);
}

async function runRefresh(env, { dryRun }) {
  const apiKey = readEnv(env, 'KIE_API_KEY');
  const result = { dryRun, scanned: 0, needingRefresh: 0, refreshed: 0, failed: 0, skippedNoTaskId: 0, skippedRecentFailure: 0, samples: [] };

  if (!apiKey) {
    return { ...result, error: 'KIE_API_KEY não configurada no servidor.' };
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return { ...result, error: 'Supabase não inicializado.' };
  }

  let orders = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('production_status', 'AUDIO_GERADO')
      .is('deleted_at', null)
      .limit(SCAN_LIMIT);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.message}` };
  }

  const candidates = [];
  for (const data of orders) {
    result.scanned++;
    if (!needsRefresh(data)) continue;

    if (data.audioRefreshFailed === 'sem_taskid') {
      result.skippedNoTaskId++;
      continue;
    }

    if (data.audioRefreshFailed && data.audioRefreshCheckedAt) {
      const checkedAt = Date.parse(data.audioRefreshCheckedAt);
      if (!Number.isNaN(checkedAt) && Date.now() - checkedAt < RETRY_FAILED_AFTER_MS) {
        result.skippedRecentFailure++;
        continue;
      }
    }

    candidates.push({ id: data.id, data });
  }

  const suspeitos = [];
  for (const data of orders) {
    if (suspeitos.length >= MAX_SUSPEITOS_POR_RUN) break;
    if (needsRefresh(data)) continue;
    if (!data.audioRefreshedAt) continue;
    if (data.audioArchivedAt) continue;

    if (faixasNoPedido(data) < 2) { suspeitos.push({ id: data.id, data }); continue; }
    const quando = Date.parse(data.audioRefreshedAt);
    if (!Number.isFinite(quando) || Date.now() - quando > JANELA_SUSPEITA_MS) continue;
    suspeitos.push({ id: data.id, data });
  }

  for (const s of suspeitos) {
    const urlAtual = s.data.audioUrl;
    // eslint-disable-next-line no-await-in-loop
    if (await audioUrlSaudavel(urlAtual)) continue;
    result.urlMortaEncontrada = (result.urlMortaEncontrada || 0) + 1;
    candidates.push(s);
  }

  result.needingRefresh = candidates.length;

  if (dryRun) {
    result.samples = candidates.slice(0, 10).map((c) => ({
      id: c.id,
      orderNumber: c.data.orderNumber || null,
      createdAt: c.data.createdAt || null,
      temTaskId: Boolean(c.data.sunoTaskId),
      urlAtual: typeof c.data.audioUrl === 'string' ? c.data.audioUrl.slice(0, 60) : null,
    }));
    return result;
  }

  for (const c of candidates.slice(0, MAX_ORDERS_PER_RUN)) {
    const taskId = await resolveTaskId(c.data, c.id, supabase);

    if (!taskId) {
      result.skippedNoTaskId++;
      await updateOrder(c.id, {
        audioRefreshFailed: 'sem_taskid',
        audioRefreshCheckedAt: new Date().toISOString(),
      }, env).catch(() => {});
      continue;
    }

    const fresh = await fetchFreshTracks(taskId, apiKey);
    if (!fresh.ok) {
      result.failed++;
      await updateOrder(c.id, {
        audioRefreshFailed: fresh.reason,
        audioRefreshCheckedAt: new Date().toISOString(),
      }, env).catch(() => {});
      continue;
    }

    if (naoPodeGravar(fresh.tracks, c.data)) {
      result.skippedParcial = (result.skippedParcial || 0) + 1;
      await updateOrder(c.id, {
        audioRefreshCheckedAt: new Date().toISOString(),
      }, env).catch(() => {});
      continue;
    }

    const audioFilesDaKie = fresh.tracks.map((t) => t.audio_url).filter(Boolean);
    const atuais = Array.isArray(c.data.audioFiles) && c.data.audioFiles.length
      ? c.data.audioFiles
      : [c.data.audioUrl].filter(Boolean);
    const audioFiles = mesclarPreservandoNosso(audioFilesDaKie, atuais);
    const audioIds = fresh.tracks.map((t) => t.trackId).filter(Boolean);

    try {
      const updates = {
        audioUrl: audioFiles[0],
        audioFiles,
        audioRefreshedAt: new Date().toISOString(),
        audioRefreshFailed: null,
        updatedAt: new Date().toISOString(),
      };
      if (audioIds.length > 0) updates.audioIds = audioIds;
      if (!c.data.sunoTaskId) updates.sunoTaskId = taskId;

      await updateOrder(c.id, updates, env);
      result.refreshed++;
    } catch (err) {
      result.failed++;
      console.warn(`[refresh-audio] Erro ao gravar URLs novas do pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await authorize(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await runRefresh(env, { dryRun: true });
  return NextResponse.json(result);
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await authorize(req, env);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
    const result = await runRefresh(env, { dryRun });

    console.log('[refresh-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[refresh-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao renovar as URLs de áudio.' }, { status: 500 });
  }
}
