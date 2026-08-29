import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { extractAudioTracks } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Renova as URLs de áudio de pedidos antigos consultando a Kie.ai.
//
// Incidente 28-29/08/2026: as URLs do domínio musicfile.kie.ai pararam de servir os arquivos —
// primeiro passaram a responder 403 quando o path tinha ".mp3" grudado (a CDN assina por path
// exato), depois passaram a responder 200 com corpo VAZIO mesmo sem o sufixo. As URLs ficaram
// gravadas quebradas em `orders.audioUrl` / `orders.audioFiles`, e isso não afeta só o player: as
// mensagens de WhatsApp mandam essas URLs CRUAS pro cliente (ver sendPaymentApprovedTemplate), então
// o link que ele recebe simplesmente não abre.
//
// Por que consultar a Kie.ai em vez de reescrever a URL localmente: o domínio que hoje funciona
// (tempfile.aiquickdraw.com) usa um HASH PRÓPRIO no path, que não tem relação com o audioId da
// faixa — verificado em 29/08/2026, tentar montar a URL a partir do audioId devolve uma página de
// erro HTML. A única fonte confiável do link atual é o endpoint record-info da Kie.ai, consultado
// por taskId. É a mesma consulta que /api/suno/status já faz para o polling.
//
// Não é destrutiva: só reescreve audioUrl/audioFiles quando a consulta devolve faixas válidas. Se a
// Kie.ai não devolver nada (arquivo expirado de vez — a doc deles avisa que expira em 14 dias), o
// pedido é marcado com audioRefreshFailed para revisão, e nada do que já existe é apagado.

const MAX_ORDERS_PER_RUN = 25;

// Quantos documentos a consulta traz por execução para depois filtrar em memória. Bem mais alto que
// o lote porque a maioria já está com URL boa e é descartada no filtro — e porque um limite curto
// esconde o tamanho real do problema: com 100, a rota relatou "só sobrou 1" quando ainda havia 165
// pedidos quebrados fora da janela. Leitura de documento é barata perto de deixar cliente com link
// morto; o custo real está nas chamadas à Kie.ai, que continuam limitadas por MAX_ORDERS_PER_RUN.
const SCAN_LIMIT = 1000;

// Depois de uma tentativa fracassada, o pedido só é tentado de novo passado este tempo. Sem isso ele
// volta em toda execução e ocupa o lote para sempre — foi o que aconteceu com um pedido de 12/08,
// cujo áudio a Kie.ai já apagou (a doc deles avisa que expira em ~14 dias) e que por isso nunca vai
// ter URL nova. Uma nova tentativa por dia é suficiente para cobrir instabilidade momentânea da API.
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

// Uma URL é considerada quebrada quando aponta para o domínio que parou de servir os arquivos.
function needsRefresh(order) {
  const urls = [order?.audioUrl, ...(Array.isArray(order?.audioFiles) ? order.audioFiles : [])];
  return urls.some((u) => typeof u === 'string' && u.includes('musicfile.kie.ai'));
}

// O taskId só passou a ser gravado no próprio pedido (`sunoTaskId`) em 28/08/2026 — antes disso o
// vínculo taskId->orderId existia apenas na coleção `suno_tasks`, escrita por src/lib/db.js:saveTask.
// Para os pedidos anteriores (a grande maioria dos que estão com URL quebrada), é de lá que dá para
// descobrir qual tarefa da Kie.ai gerou aquela música. Mesma busca inversa que api/orders/reconcile
// já faz para destravar pedido preso.
async function resolveTaskId(order, orderId) {
  if (order?.sunoTaskId) return order.sunoTaskId;
  try {
    const snap = await getDocs(query(
      collection(db, 'suno_tasks'),
      where('orderId', '==', orderId),
      limit(1)
    ));
    if (!snap.empty) return snap.docs[0].id;
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

    // Mesmo extrator do webhook e do polling — conhece todos os formatos que a Kie.ai já usou.
    const tracks = extractAudioTracks(data);
    // Descarta faixa que voltou apontando de novo para o domínio quebrado: trocar uma URL que não
    // funciona por outra que também não funciona só mascara o problema.
    const usable = tracks.filter((t) => t.audio_url && !t.audio_url.includes('musicfile.kie.ai'));
    if (usable.length === 0) return { ok: false, reason: 'sem_url_utilizavel' };

    return { ok: true, tracks: usable };
  } catch (err) {
    return { ok: false, reason: err?.message || 'erro_desconhecido' };
  }
}

async function runRefresh(env, { dryRun }) {
  const apiKey = readEnv(env, 'KIE_API_KEY');
  const result = { dryRun, scanned: 0, needingRefresh: 0, refreshed: 0, failed: 0, skippedNoTaskId: 0, skippedRecentFailure: 0, samples: [] };

  if (!apiKey) {
    return { ...result, error: 'KIE_API_KEY não configurada no servidor.' };
  }

  // productionStatus AUDIO_GERADO é o estado de quem já tem áudio salvo — é onde as URLs quebradas
  // moram. Campo único, índice automático do Firestore.
  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('productionStatus', '==', 'AUDIO_GERADO'),
      limit(SCAN_LIMIT)
    ));
  } catch (err) {
    return { ...result, error: `consulta_falhou: ${err?.code || err?.message}` };
  }

  const candidates = [];
  for (const d of snap.docs) {
    result.scanned++;
    const data = d.data();
    if (!needsRefresh(data)) continue;

    // Já foi verificado antes e não tem como recuperar (sem taskId em lugar nenhum). Sem esta
    // exclusão ele voltaria à fila em toda execução — a consulta traz sempre os mesmos documentos
    // primeiro — e travaria o avanço sobre os que ainda dá para renovar.
    if (data.audioRefreshFailed === 'sem_taskid') {
      result.skippedNoTaskId++;
      continue;
    }

    // Falhou há pouco: não insiste antes do intervalo (ver RETRY_FAILED_AFTER_MS).
    if (data.audioRefreshFailed && data.audioRefreshCheckedAt) {
      const checkedAt = Date.parse(data.audioRefreshCheckedAt);
      if (!Number.isNaN(checkedAt) && Date.now() - checkedAt < RETRY_FAILED_AFTER_MS) {
        result.skippedRecentFailure++;
        continue;
      }
    }

    candidates.push({ id: d.id, data });
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
    const taskId = await resolveTaskId(c.data, c.id);

    if (!taskId) {
      // Nem no pedido nem em suno_tasks — não há como perguntar à Kie.ai qual é a URL atual desta
      // música. Marca para não voltar na fila a cada execução e travar o avanço dos recuperáveis.
      result.skippedNoTaskId++;
      await updateDoc(doc(db, 'orders', c.id), {
        audioRefreshFailed: 'sem_taskid',
        audioRefreshCheckedAt: new Date().toISOString(),
      }).catch(() => {});
      continue;
    }

    const fresh = await fetchFreshTracks(taskId, apiKey);
    if (!fresh.ok) {
      result.failed++;
      await updateDoc(doc(db, 'orders', c.id), {
        audioRefreshFailed: fresh.reason,
        audioRefreshCheckedAt: new Date().toISOString(),
      }).catch(() => {});
      continue;
    }

    const audioFiles = fresh.tracks.map((t) => t.audio_url).filter(Boolean);
    const audioIds = fresh.tracks.map((t) => t.trackId).filter(Boolean);

    try {
      const updates = {
        audioUrl: audioFiles[0],
        audioFiles,
        audioRefreshedAt: new Date().toISOString(),
        audioRefreshFailed: null,
        updatedAt: new Date().toISOString(),
      };
      // Só sobrescreve audioIds se a consulta trouxe — não vale perder o que já estava salvo.
      if (audioIds.length > 0) updates.audioIds = audioIds;
      // Persiste o taskId que veio de suno_tasks: da próxima vez não precisa da busca inversa, e é
      // o campo que o add-on de playback usa para pedir a separação vocal à Kie.ai.
      if (!c.data.sunoTaskId) updates.sunoTaskId = taskId;

      await updateDoc(doc(db, 'orders', c.id), updates);
      result.refreshed++;
    } catch (err) {
      result.failed++;
      console.warn(`[refresh-audio] Erro ao gravar URLs novas do pedido ${c.id}:`, err.message);
    }
  }

  return result;
}

// GET = sempre simulação: mostra quantos pedidos têm URL quebrada, sem alterar nada.
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

// POST = executa a renovação (processa até MAX_ORDERS_PER_RUN por chamada; repetir até needingRefresh
// chegar a zero).
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
