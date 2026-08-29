import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { requireAdmin } from '@/lib/auth';

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
// Como roda: uma vez por hora pelo cron do Worker (ver workers/efi-proxy), em lotes pequenos. Não é
// disparado dentro do fluxo de pagamento de propósito — copiar dezenas de MB é lento e não pode
// atrasar (nem arriscar derrubar) a confirmação da compra.

// Lote pequeno: cada faixa é uma transferência de vários MB atravessando o Worker, e o Edge Runtime
// tem teto de CPU e de subrequests por requisição.
const MAX_ORDERS_PER_RUN = 5;

// Acima disso, não tenta arquivar: é sinal de resposta de erro (HTML/XML) em vez de áudio, ou de um
// arquivo grande demais para o Worker copiar com segurança.
const MIN_AUDIO_BYTES = 100 * 1024;      // 100 KB — abaixo disso não é música
const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MB

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

function isOurStorage(url) {
  return typeof url === 'string' && url.includes('firebasestorage.googleapis.com');
}

/**
 * Copia uma URL externa para o nosso Storage e devolve a URL pública.
 *
 * Usa a REST API do Firebase Storage: o SDK `firebase/storage` não tem build `lite` e importá-lo
 * numa rota Edge quebra o build do Cloudflare (.claude/rules/backend.md). O corpo é repassado como
 * ArrayBuffer porque o upload precisa do tamanho conhecido — 5 MB cabe folgado no limite de memória
 * do Worker, e o teto de MAX_AUDIO_BYTES protege contra um arquivo inesperadamente grande.
 */
async function copyToStorage(sourceUrl, destPath, bucket) {
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'audio/mpeg, audio/*, */*' },
    signal: AbortSignal.timeout(45000),
  });

  if (!res.ok) return { ok: false, reason: `origem_http_${res.status}` };

  const contentType = res.headers.get('content-type') || '';
  // A CDN já devolveu HTML/XML de erro com status 200 (incidente 28/08/2026) — sem esta checagem,
  // arquivaríamos uma página de erro achando que era a música.
  if (contentType.includes('text/') || contentType.includes('xml')) {
    return { ok: false, reason: `origem_nao_audio_${contentType.split(';')[0]}` };
  }

  const buffer = await res.arrayBuffer();
  if (buffer.byteLength < MIN_AUDIO_BYTES) return { ok: false, reason: `origem_muito_pequena_${buffer.byteLength}b` };
  if (buffer.byteLength > MAX_AUDIO_BYTES) return { ok: false, reason: `origem_muito_grande_${buffer.byteLength}b` };

  const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(destPath)}`;
  const upload = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'audio/mpeg' },
    body: buffer,
    signal: AbortSignal.timeout(60000),
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => '');
    return { ok: false, reason: `upload_http_${upload.status}`, detail: detail.slice(0, 200) };
  }

  const meta = await upload.json().catch(() => null);
  const token = meta?.downloadTokens;
  const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(destPath)}?alt=media${token ? `&token=${token}` : ''}`;
  return { ok: true, url: publicUrl, bytes: buffer.byteLength };
}

async function runArchive(env, { dryRun }) {
  const bucket = readEnv(env, 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  const result = { dryRun, scanned: 0, pending: 0, archived: 0, filesCopied: 0, failed: 0, bytesCopied: 0, samples: [] };

  if (!bucket) return { ...result, error: 'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET não configurado.' };

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
    const archived = [];
    let anyFailure = false;

    for (let i = 0; i < c.files.length; i++) {
      const source = c.files[i];
      // URL que já é nossa é preservada como está — não faz sentido recopiar.
      if (isOurStorage(source)) {
        archived.push(source);
        continue;
      }

      const destPath = `audios/${c.id}/versao-${i + 1}.mp3`;
      const copy = await copyToStorage(source, destPath, bucket);

      if (copy.ok) {
        archived.push(copy.url);
        result.filesCopied++;
        result.bytesCopied += copy.bytes;
      } else {
        anyFailure = true;
        console.warn(`[archive-audio] Falha ao arquivar faixa ${i + 1} do pedido ${c.id}: ${copy.reason}`);
        // Mantém a URL antiga: enquanto a origem não some, ela ainda é o único caminho para o áudio.
        archived.push(source);
      }
    }

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
