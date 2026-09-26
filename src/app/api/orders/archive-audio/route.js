import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { updateOrder } from '@/lib/supabaseDb';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { requireAdmin } from '@/lib/auth';
import { isOurStorage, archiveAudioFiles } from '@/lib/audioArchive';

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

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await authorize(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

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
    const result = await runArchive(env, { dryRun, incluirNaoPagos });

    console.log('[archive-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[archive-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao arquivar os áudios.' }, { status: 500 });
  }
}
