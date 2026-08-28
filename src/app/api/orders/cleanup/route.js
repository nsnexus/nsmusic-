import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { consolidateOrders } from '@/lib/stats';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Limpeza de pedidos antigos.
//
// Decisão de negócio (28/08/2026): pedido NÃO PAGO com mais de RETENTION_DAYS dias é apagado DE
// VERDADE (documento, suno_tasks e arquivos no Storage). É esse o volume que pesa — prévia gerada e
// abandonada, que ninguém vai acessar de novo. QUEM PAGOU FICA: o cliente continua conseguindo abrir
// a entrega e baixar meses depois. Exceção consciente à regra de exclusão lógica de
// .claude/rules/database.md, que existe para exclusão pontual feita pelo admin — aqui o objetivo é
// parar de pagar armazenamento, e um `deletedAt` continuaria custando.
//
// O FATURAMENTO não se perde: antes de apagar, os números vão para a coleção `stats`
// (ver src/lib/stats.js) — quantas músicas geradas/pagas, vídeos, playbacks e receita, por dia.
//
// IRREVERSÍVEL: não há como recuperar o que esta rota apaga. Por isso ela roda em modo simulação
// (?dryRun=true) sem apagar nada, e o cron abaixo é o único que executa de verdade.

const RETENTION_DAYS = 10;

// Teto por execução: cada pedido custa leitura + escrita + chamadas ao Storage, e o Edge Runtime tem
// limite de CPU e de subrequests por requisição. O cron roda diariamente, então o backlog é
// consumido em algumas execuções em vez de tentar tudo de uma vez e estourar no meio.
const MAX_ORDERS_PER_RUN = 40;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

// Quem pagou nunca é apagado. Considera pago também quem comprou só um add-on (vídeo ou playback)
// sem que o pagamento principal tenha sido registrado — é dinheiro que entrou, o cliente tem
// conteúdo liberado esperando por ele. PAGO e PAGAMENTO_APROVADO são equivalentes (ver CLAUDE.md).
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

// Autoriza por segredo compartilhado (cron, que não tem conta de usuário) OU por token de admin
// (uso manual pelo painel) — mesmo padrão de api/orders/reconcile.
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

// Apaga um arquivo do Firebase Storage pela URL pública salva no pedido.
//
// Usa a REST API em vez do SDK `firebase/storage`: aquele pacote não tem build `lite` e importá-lo
// numa rota Edge quebra o build do Cloudflare (ver .claude/rules/backend.md). A URL pública tem o
// formato .../v0/b/BUCKET/o/CAMINHO_ESCAPADO?alt=media&token=..., e o DELETE é no mesmo caminho sem
// a query string.
async function deleteStorageFile(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  if (!rawUrl.includes('firebasestorage.googleapis.com')) return false;

  try {
    const parsed = new URL(rawUrl);
    const deleteUrl = `${parsed.origin}${parsed.pathname}`;
    const res = await fetch(deleteUrl, { method: 'DELETE', signal: AbortSignal.timeout(10000) });
    // 404 = já não existe: para o objetivo (não pagar por ele) é o mesmo que sucesso.
    return res.ok || res.status === 404;
  } catch (err) {
    console.warn('[cleanup] Falha ao apagar arquivo do Storage:', err.message);
    return false;
  }
}

// Todos os campos do pedido que podem apontar para um arquivo no nosso Storage.
function collectStorageUrls(order) {
  const urls = [];
  if (order?.coverUrl) urls.push(order.coverUrl);
  if (order?.videoUrl) urls.push(order.videoUrl);
  if (Array.isArray(order?.slideshowImages)) urls.push(...order.slideshowImages);
  if (Array.isArray(order?.existingPhotos)) urls.push(...order.existingPhotos);
  return urls.filter((u) => typeof u === 'string' && u.includes('firebasestorage.googleapis.com'));
}

async function deleteRelatedTasks(orderId) {
  let removed = 0;
  try {
    const snap = await getDocs(query(collection(db, 'suno_tasks'), where('orderId', '==', orderId), limit(10)));
    for (const taskDoc of snap.docs) {
      await deleteDoc(doc(db, 'suno_tasks', taskDoc.id))
        .then(() => { removed++; })
        .catch((e) => console.warn(`[cleanup] Erro ao remover suno_task ${taskDoc.id}:`, e.message));
    }
  } catch (err) {
    console.warn('[cleanup] Erro ao listar suno_tasks do pedido:', err.message);
  }
  return removed;
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

  // createdAt é gravado como string ISO em todo o sistema (convenção do CLAUDE.md), e comparação
  // lexicográfica de ISO é equivalente à cronológica — campo único, índice automático do Firestore.
  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('createdAt', '<', cutoffIso),
      limit(MAX_ORDERS_PER_RUN)
    ));
  } catch (err) {
    console.error('[cleanup] Falha ao listar pedidos antigos:', err.message);
    return { ...result, error: err?.code || 'consulta_falhou' };
  }

  const candidates = [];
  for (const d of snap.docs) {
    const data = d.data();
    // Documentos de sistema (config_whatsapp, session_* do agente) não são pedidos e têm ciclo de
    // vida próprio — as sessões abandonadas já são limpas por api/orders/reconcile.
    if (d.id.startsWith('config_') || d.id.startsWith('session_')) continue;
    if (data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') continue;
    candidates.push({ id: d.id, data, paid: isPaidOrder(data) });
  }

  result.found = candidates.length;
  if (candidates.length === 0) return result;

  // QUEM PAGOU FICA. Só o pedido não pago é apagado — é ele que representa a maior parte do volume
  // (prévia gerada e abandonada) e não tem cliente esperando acessar depois. Cliente que pagou
  // continua conseguindo abrir a página de entrega e baixar meses depois.
  const toDelete = candidates.filter((c) => !c.paid);
  result.paidKept = candidates.length - toDelete.length;

  // Consolida TODOS os antigos (pagos e não pagos), não só os que serão apagados: assim a coleção
  // `stats` reflete o período inteiro, e não uma fatia enviesada só de quem não pagou. A flag
  // statsConsolidated impede que o pedido pago — que continua no banco e reaparece nesta consulta
  // todo dia — seja somado de novo a cada execução.
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
    const stats = await consolidateOrders(toConsolidate.map((c) => c.data));
    if (stats.error) {
      // Sem métricas gravadas, apagar seria perder o faturamento do período — aborta e tenta amanhã.
      console.error('[cleanup] Consolidação falhou; nada será apagado nesta execução.');
      return { ...result, error: 'consolidacao_falhou', errors: 1 };
    }
    result.consolidated = stats.consolidated;

    for (const c of toConsolidate) {
      await updateDoc(doc(db, 'orders', c.id), { statsConsolidated: true })
        .catch((e) => console.warn(`[cleanup] Erro ao marcar pedido consolidado:`, e.message));
    }
  }

  // toDelete, não candidates: pedido pago é preservado por completo (documento, arquivos e tasks).
  for (const c of toDelete) {
    try {
      for (const url of collectStorageUrls(c.data)) {
        const ok = await deleteStorageFile(url);
        if (ok) result.filesDeleted++;
      }

      result.tasksDeleted += await deleteRelatedTasks(c.id);

      await deleteDoc(doc(db, 'orders', c.id));
      result.ordersDeleted++;
    } catch (err) {
      result.errors++;
      console.warn(`[cleanup] Erro ao apagar pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

// GET = simulação sempre (nunca apaga), para conferir pelo navegador o que seria removido.
export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await authorize(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const result = await runCleanup(env, { dryRun: true });
  return NextResponse.json(result);
}

// POST = execução real, salvo com ?dryRun=true.
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
    const result = await runCleanup(env, { dryRun });

    console.log('[cleanup] Resultado:', JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error('[cleanup] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao executar a limpeza.' }, { status: 500 });
  }
}
