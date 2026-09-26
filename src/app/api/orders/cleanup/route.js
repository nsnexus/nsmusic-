import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { updateOrder } from '@/lib/supabaseDb';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { consolidateOrders } from '@/lib/stats';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const RETENTION_DAYS = 10;
const STALE_PHOTO_HOURS = 48;
const MAX_PHOTO_ORDERS_PER_RUN = 30;
const MAX_ORDERS_PER_RUN = 40;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

function isPaidOrder(order) {
  return Boolean(
    order?.paymentStatus === 'PAGAMENTO_APROVADO' ||
    order?.paymentStatus === 'PAGO' ||
    order?.paidAt ||
    order?.videoAddonPaid ||
    order?.hasVideoAccess ||
    order?.playbackAddonPaid ||
    order?.hasPlaybackAccess
  );
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

async function deleteStorageFile(rawUrl, env = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  // Cloudflare R2
  if (env?.nsmusic_media && rawUrl.includes(readEnv(env, 'R2_PUBLIC_URL'))) {
    try {
      const parsed = new URL(rawUrl);
      const key = parsed.pathname.replace(/^\/+/, '');
      await env.nsmusic_media.delete(key);
      return true;
    } catch (e) {
      console.warn('[cleanup] Erro ao deletar de R2:', e.message);
      return false;
    }
  }

  // Firebase legacy
  if (rawUrl.includes('firebasestorage.googleapis.com')) {
    try {
      const parsed = new URL(rawUrl);
      const deleteUrl = `${parsed.origin}${parsed.pathname}`;
      const res = await fetch(deleteUrl, { method: 'DELETE', signal: AbortSignal.timeout(10000) });
      return res.ok || res.status === 404;
    } catch (err) {
      console.warn('[cleanup] Falha ao apagar arquivo do Storage:', err.message);
      return false;
    }
  }

  return false;
}

function collectStorageUrls(order) {
  const urls = [];
  if (order?.coverUrl) urls.push(order.coverUrl);
  if (order?.videoUrl) urls.push(order.videoUrl);
  if (Array.isArray(order?.slideshowImages)) urls.push(...order.slideshowImages);
  if (Array.isArray(order?.existingPhotos)) urls.push(...order.existingPhotos);
  return urls.filter((u) => typeof u === 'string');
}

async function deleteRelatedTasks(orderId, supabase) {
  if (!supabase) return 0;
  try {
    const { data } = await supabase.from('suno_tasks').delete().eq('order_id', orderId).select('id');
    return Array.isArray(data) ? data.length : 0;
  } catch (err) {
    console.warn('[cleanup] Erro ao listar suno_tasks do pedido:', err.message);
    return 0;
  }
}

function extractPhotoTimestamp(rawUrl) {
  try {
    const decodedPath = decodeURIComponent(new URL(rawUrl).pathname);
    const match = decodedPath.match(/\/photos\/(\d{10,})_/);
    return match ? Number(match[1]) : null;
  } catch (e) {
    return null;
  }
}

async function cleanupStalePhotos(env, { dryRun }) {
  const result = { checked: 0, ordersCleaned: 0, filesDeleted: 0, errors: 0, dryRun };
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { ...result, error: 'Supabase não inicializado' };

  let orders = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('video_status', ['GERANDO', 'ERRO'])
      .is('deleted_at', null)
      .limit(MAX_PHOTO_ORDERS_PER_RUN);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    console.warn('[cleanup] Falha ao listar pedidos com fotos pendentes:', err.message);
    return { ...result, error: err?.message || 'consulta_falhou' };
  }

  const cutoffMs = Date.now() - STALE_PHOTO_HOURS * 60 * 60 * 1000;

  for (const data of orders) {
    const photos = Array.isArray(data.slideshowImages) ? data.slideshowImages.filter((u) => typeof u === 'string') : [];
    if (photos.length === 0) continue;

    if (data.hasRetrospectivaAccess || data.retrospectivaAddonPaid) continue;

    const isStale = photos.every((url) => {
      const ts = extractPhotoTimestamp(url);
      return ts === null || ts < cutoffMs;
    });
    if (!isStale) continue;

    result.checked++;
    if (dryRun) continue;

    let allDeleted = true;
    for (const url of photos) {
      const ok = await deleteStorageFile(url, env);
      if (ok) result.filesDeleted++; else allDeleted = false;
    }

    if (allDeleted) {
      try {
        await updateOrder(data.id, {
          slideshowImages: [],
          updatedAt: new Date().toISOString(),
        }, env);
        result.ordersCleaned++;
      } catch (err) {
        result.errors++;
        console.warn(`[cleanup] Falha ao limpar slideshowImages do pedido ${data.id}:`, err.message);
      }
    } else {
      result.errors++;
    }
  }

  if (dryRun) result.wouldClean = result.checked;
  return result;
}

async function runCleanup(env, { dryRun }) {
  const cutoffIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const result = {
    cutoff: cutoffIso,
    retentionDays: RETENTION_DAYS,
    dryRun,
    found: 0,
    paidKept: 0,
    consolidated: 0,
    ordersDeleted: 0,
    tasksDeleted: 0,
    filesDeleted: 0,
    errors: 0,
  };

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return { ...result, error: 'Supabase não inicializado' };
  }

  let orders = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .lt('created_at', cutoffIso)
      .is('deleted_at', null)
      .limit(MAX_ORDERS_PER_RUN);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    console.error('[cleanup] Falha ao listar pedidos antigos:', err.message);
    return { ...result, error: err?.message || 'consulta_falhou' };
  }

  const candidates = [];
  for (const data of orders) {
    if (data.id.startsWith('config_') || data.id.startsWith('session_')) continue;
    if (data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') continue;
    candidates.push({ id: data.id, data, paid: isPaidOrder(data) });
  }

  result.found = candidates.length;
  if (candidates.length === 0) return result;

  const toDelete = candidates.filter((c) => !c.paid);
  result.paidKept = candidates.length - toDelete.length;

  const toConsolidate = candidates.filter((c) => !c.data.statsConsolidated);

  if (dryRun) {
    result.consolidated = toConsolidate.length;
    result.wouldDelete = toDelete.length;
    result.sample = candidates.slice(0, 5).map((c) => ({
      id: c.id,
      createdAt: c.data.createdAt || null,
      paymentStatus: c.data.paymentStatus || null,
      acao: c.paid ? 'MANTIDO (pago)' : 'seria apagado',
      storageFiles: collectStorageUrls(c.data).length,
    }));
    return result;
  }

  if (toConsolidate.length > 0) {
    const stats = await consolidateOrders(toConsolidate.map((c) => c.data), env);
    if (stats.error) {
      console.error('[cleanup] Consolidação falhou; nada será apagado nesta execução.');
      return { ...result, error: 'consolidacao_falhou', errors: 1 };
    }
    result.consolidated = stats.consolidated;

    for (const c of toConsolidate) {
      await updateOrder(c.id, { statsConsolidated: true }, env)
        .catch((e) => console.warn(`[cleanup] Erro ao marcar pedido consolidado:`, e.message));
    }
  }

  for (const c of toDelete) {
    try {
      for (const url of collectStorageUrls(c.data)) {
        const ok = await deleteStorageFile(url, env);
        if (ok) result.filesDeleted++;
      }

      result.tasksDeleted += await deleteRelatedTasks(c.id, supabase);

      await supabase.from('orders').delete().eq('id', c.id);
      result.ordersDeleted++;
    } catch (err) {
      result.errors++;
      console.warn(`[cleanup] Erro ao apagar pedido ${c.id}:`, err.message);
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

  const orders = await runCleanup(env, { dryRun: true });
  const photos = await cleanupStalePhotos(env, { dryRun: true }).catch((err) => {
    console.error('[cleanup] Falha inesperada na fase de fotos:', err.message);
    return { error: 'falha_inesperada' };
  });
  return NextResponse.json({ orders, photos });
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
    const orders = await runCleanup(env, { dryRun });

    let photos;
    try {
      photos = await cleanupStalePhotos(env, { dryRun });
    } catch (err) {
      console.error('[cleanup] Falha inesperada na fase de fotos:', err.message);
      photos = { error: 'falha_inesperada' };
    }

    const result = { orders, photos };
    console.log('[cleanup] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cleanup] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao executar a limpeza.' }, { status: 500 });
  }
}
