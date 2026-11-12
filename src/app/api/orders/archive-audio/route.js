import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { updateOrder } from '@/lib/supabaseDb';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { requireAdmin } from '@/lib/auth';
import { isOurStorage, archiveAudioFiles } from '@/lib/audioArchive';
import { hasBrokenXingHeader, inspectMp3Buffer, repairMp3XingHeader } from '@/lib/mp3XingFix';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_ORDERS_PER_RUN = 5;

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

function isPaidOrder(order) {
  return Boolean(
    order?.paymentStatus === 'PAGAMENTO_APROVADO' ||
    order?.paymentStatus === 'PAGO' ||
    order?.paidAt
  );
}

async function runArchive(env, { dryRun, incluirNaoPagos = false }) {
  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = readEnv(env, 'R2_PUBLIC_URL');
  const result = { dryRun, scanned: 0, pending: 0, archived: 0, filesCopied: 0, failed: 0, bytesCopied: 0, samples: [] };

  if (!r2Bucket || !r2PublicUrl) {
    return { ...result, error: 'R2 não configurado (nsmusic_media / R2_PUBLIC_URL).' };
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
      .order('created_at', { ascending: false })
      .limit(MAX_ORDERS_PER_RUN * 20);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.message}` };
  }

  const candidates = [];
  for (const data of orders) {
    result.scanned++;

    const files = Array.isArray(data.audioFiles) && data.audioFiles.length
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);

    if (files.length === 0) continue;
    if (files.every(isOurStorage)) continue;

    const temUrlEfemera = files.some((u) => typeof u === 'string' && (u.includes('audiostream.kie.ai') || u.includes('musicfile.kie.ai')));

    if (data.audioArchivedAt && !temUrlEfemera) continue;
    if (!isPaidOrder(data) && !incluirNaoPagos) continue;

    candidates.push({ id: data.id, data, files });
  }

  candidates.sort((a, b) => Number(isPaidOrder(b.data)) - Number(isPaidOrder(a.data)));
  result.pending = candidates.length;

  if (dryRun) {
    result.samples = candidates.slice(0, 10).map((c) => ({
      id: c.id,
      orderNumber: c.data.orderNumber || null,
      paidAt: c.data.paidAt || null,
      faixas: c.files.length,
    }));
    return result;
  }

  for (const c of candidates.slice(0, MAX_ORDERS_PER_RUN)) {
    const { files: archived, anyFailure, filesCopied, bytesCopied } = await archiveAudioFiles(c.id, c.files, { r2Bucket, r2PublicUrl });
    result.filesCopied += filesCopied;
    result.bytesCopied += bytesCopied;

    try {
      const updates = {
        audioFiles: archived,
        audioUrl: archived[0],
        updatedAt: new Date().toISOString(),
      };

      if (anyFailure) {
        updates.audioArchiveFailedAt = new Date().toISOString();
        result.failed++;
      } else {
        updates.audioArchivedAt = new Date().toISOString();
        updates.audioArchiveFailedAt = null;
        result.archived++;
      }

      await updateOrder(c.id, updates, env);
    } catch (err) {
      result.failed++;
      console.warn(`[archive-audio] Erro ao gravar URLs arquivadas do pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

async function tryFetchFinalizedFromTempfile(audioId) {
  if (!audioId) return null;
  try {
    const res = await fetch(`https://tempfile.aiquickdraw.com/r/${audioId}.mp3`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/mpeg, audio/*, */*' },
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/') || ct.includes('xml')) return null;
    const len = Number(res.headers.get('content-length') || 0);
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100 * 1024) return null;
    if (len > 0 && buf.byteLength !== len) return null;
    const info = inspectMp3Buffer(buf);
    if (!info.validMp3 || info.xingBroken || info.actualFrames < 50) return null;
    return buf;
  } catch {
    return null;
  }
}

async function runRepairXing(env, { dryRun, targetOrderId = '' }) {
  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = readEnv(env, 'R2_PUBLIC_URL').replace(/\/+$/, '');
  const result = { mode: 'repair_xing', dryRun, scanned: 0, broken: 0, repaired: 0, upgradedFromTempfile: 0, patchedInPlace: 0, failed: 0, samples: [] };

  if (!r2Bucket || !r2PublicUrl) {
    return { ...result, error: 'R2 não configurado (nsmusic_media / R2_PUBLIC_URL).' };
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return { ...result, error: 'Supabase não inicializado.' };
  }

  let orders = [];
  try {
    let query = supabase
      .from('orders')
      .select('*')
      .is('deleted_at', null);

    if (targetOrderId) {
      query = query.eq('id', targetOrderId).limit(1);
    } else {
      query = query
        .eq('production_status', 'AUDIO_GERADO')
        .order('created_at', { ascending: false })
        .limit(40);
    }

    const { data, error } = await query;
    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.message}` };
  }

  const brokenOrders = [];
  for (const data of orders) {
    if (data.audioXingRepairedAt && !targetOrderId) continue;
    const files = Array.isArray(data.audioFiles) && data.audioFiles.length
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);
    const r2Files = files.filter((u) => typeof u === 'string' && u.startsWith(`${r2PublicUrl}/`));
    if (r2Files.length === 0) continue;

    result.scanned++;
    const brokenUrls = [];
    for (let idx = 0; idx < files.length; idx++) {
      const u = files[idx];
      if (typeof u !== 'string' || !u.startsWith(`${r2PublicUrl}/`)) continue;
      const key = u.slice(r2PublicUrl.length + 1).split('?')[0];
      try {
        const prefixObj = await r2Bucket.get(key, { range: { offset: 0, length: 4096 } });
        if (!prefixObj) continue;
        const prefixBuf = await prefixObj.arrayBuffer();
        if (hasBrokenXingHeader(prefixBuf)) {
          brokenUrls.push({ idx, key, url: u, audioId: data.audioIds?.[idx] || null });
        }
      } catch (e) {}
    }

    if (brokenUrls.length > 0) {
      result.broken++;
      brokenOrders.push({ id: data.id, data, brokenUrls });
    }
  }

  if (dryRun) {
    result.samples = brokenOrders.slice(0, 10).map((b) => ({
      id: b.id,
      orderNumber: b.data.orderNumber || null,
      paid: b.data.paymentStatus,
      brokenTracks: b.brokenUrls.length,
    }));
    return result;
  }

  for (const item of brokenOrders.slice(0, MAX_ORDERS_PER_RUN)) {
    let orderOk = true;
    for (const track of item.brokenUrls) {
      try {
        const tempfileBuf = await tryFetchFinalizedFromTempfile(track.audioId);
        if (tempfileBuf) {
          await r2Bucket.put(track.key, tempfileBuf, { httpMetadata: { contentType: 'audio/mpeg' } });
          result.upgradedFromTempfile++;
          continue;
        }

        const fullObj = await r2Bucket.get(track.key);
        if (!fullObj) {
          orderOk = false;
          continue;
        }
        const fullBuf = await fullObj.arrayBuffer();
        const fixed = repairMp3XingHeader(fullBuf);
        if (fixed.repaired) {
          await r2Bucket.put(track.key, fixed.buffer, { httpMetadata: { contentType: 'audio/mpeg' } });
          result.patchedInPlace++;
        } else {
          orderOk = false;
        }
      } catch (err) {
        orderOk = false;
        console.warn(`[archive-audio] Erro ao reparar Xing do pedido ${item.id} (${track.key}):`, err?.message);
      }
    }

    if (orderOk) {
      result.repaired++;
      await updateOrder(item.id, {
        audioArchivedFromStream: false,
        audioXingRepairedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, env).catch(() => {});
    } else {
      result.failed++;
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

  const params = new URL(req.url).searchParams;
  if (params.get('repararXing') === 'true') {
    const targetOrderId = String(params.get('orderId') || '').trim();
    return NextResponse.json(await runRepairXing(env, { dryRun: true, targetOrderId }));
  }

  return NextResponse.json(await runArchive(env, { dryRun: true }));
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

    const params = new URL(req.url).searchParams;
    const dryRun = params.get('dryRun') === 'true';
    const incluirNaoPagos = params.get('incluirNaoPagos') === 'true';

    if (params.get('repararXing') === 'true') {
      const targetOrderId = String(params.get('orderId') || '').trim();
      const repairResult = await runRepairXing(env, { dryRun, targetOrderId });
      console.log('[archive-audio] Resultado reparo Xing:', JSON.stringify(repairResult));
      return NextResponse.json(repairResult);
    }

    const result = await runArchive(env, { dryRun, incluirNaoPagos });

    console.log('[archive-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[archive-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao arquivar os áudios.' }, { status: 500 });
  }
}
