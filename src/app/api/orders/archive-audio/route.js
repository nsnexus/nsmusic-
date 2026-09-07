import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';
import { isOurStorage, archiveAudioFiles } from '@/lib/audioArchive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Arquiva no NOSSO Firebase Storage o áudio dos pedidos PAGOS.
//
// Motivo: a Kie.ai apaga os arquivos gerados depois de ~14 dias — está escrito na documentação
// deles ("Cache generated content since files expire after 14 days"), e em 28-29/08/2026 a coisa foi
// pior que isso: as URLs pararam de servir muito antes do prazo. Enquanto o áudio mora só lá, todo
// pedido pago vira um link quebrado com data marcada — inclusive o link que o cliente já recebeu por
// WhatsApp, que aponta para a URL crua.
//
// Só pedido PAGO é arquivado: prévia não convertida é a maior parte do volume e não justifica o
// custo de armazenamento (~5 MB por faixa). Quem pagou tem direito a voltar e baixar meses depois.
//
// Achado 04/09/2026: desde este commit, o arquivamento também acontece NA HORA da aprovação do
// pagamento (ver src/lib/payments.js) — o cron aqui virou REDE DE SEGURANÇA, não o caminho
// principal. Existe pra pegar pedidos cujo arquivamento imediato falhou (origem instável no
// momento exato do pagamento) e pedidos antigos, de antes dessa mudança. A lógica de cópia em si
// mora em src/lib/audioArchive.js, compartilhada entre os dois caminhos.

// Lote pequeno: cada faixa é uma transferência de vários MB atravessando o Worker, e o Edge Runtime
// tem teto de CPU e de subrequests por requisição.
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

async function runArchive(env, { dryRun }) {
  // R2 (binding nsmusic_media) primeiro, Firebase Storage como fallback — mesmo critério de
  // src/lib/payments.js, pra não arquivar num destino diferente dependendo de qual caminho rodou.
  const r2Bucket = env?.nsmusic_media;
  const r2PublicUrl = readEnv(env, 'R2_PUBLIC_URL');
  const firebaseBucket = readEnv(env, 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  const result = { dryRun, scanned: 0, pending: 0, archived: 0, filesCopied: 0, failed: 0, bytesCopied: 0, samples: [] };

  if (!(r2Bucket && r2PublicUrl) && !firebaseBucket) {
    return { ...result, error: 'Nem R2 (nsmusic_media/R2_PUBLIC_URL) nem NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET configurados.' };
  }

  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('productionStatus', '==', 'AUDIO_GERADO'),
      limit(MAX_ORDERS_PER_RUN * 20)
    ));
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.code || err?.message}` };
  }

  const candidates = [];
  for (const d of snap.docs) {
    result.scanned++;
    const data = d.data();
    if (!isPaidOrder(data)) continue;
    if (data.audioArchivedAt) continue; // já arquivado

    const files = Array.isArray(data.audioFiles) && data.audioFiles.length
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);

    // Já está tudo no nosso Storage (pedido antigo migrado à mão, por exemplo).
    if (files.length > 0 && files.every(isOurStorage)) continue;
    if (files.length === 0) continue;

    candidates.push({ id: d.id, data, files });
  }

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
    const { files: archived, anyFailure, filesCopied, bytesCopied } = await archiveAudioFiles(c.id, c.files, { r2Bucket, r2PublicUrl, firebaseBucket });
    result.filesCopied += filesCopied;
    result.bytesCopied += bytesCopied;

    try {
      const updates = {
        audioFiles: archived,
        audioUrl: archived[0],
        updatedAt: new Date().toISOString(),
      };

      if (anyFailure) {
        // Sem audioArchivedAt, o pedido volta na próxima execução para tentar de novo as faixas que
        // falharam — pode ser instabilidade momentânea da CDN de origem.
        updates.audioArchiveFailedAt = new Date().toISOString();
        result.failed++;
      } else {
        updates.audioArchivedAt = new Date().toISOString();
        updates.audioArchiveFailedAt = null;
        result.archived++;
      }

      await updateDoc(doc(db, 'orders', c.id), updates);
    } catch (err) {
      result.failed++;
      console.warn(`[archive-audio] Erro ao gravar URLs arquivadas do pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

// GET = simulação: mostra quantos pedidos pagos ainda dependem da CDN da Kie.ai.
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

    const dryRun = new URL(req.url).searchParams.get('dryRun') === 'true';
    const result = await runArchive(env, { dryRun });

    console.log('[archive-audio] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[archive-audio] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao arquivar os áudios.' }, { status: 500 });
  }
}
