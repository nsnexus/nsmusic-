import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, deleteDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { updateTaskResult, extractAudioTracks } from '@/lib/db';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';
import { requireAdmin } from '@/lib/auth';
import { resolveLatestTaskId, maybeAutoRetrySunoFailure, recordSunoFailure } from '@/lib/suno';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Reconciliação de pedidos travados.
//
// Motivo: hoje o resultado da Kie.ai e a confirmação de pagamento dependem de duas vias — o webhook
// do provedor e o polling feito pelo NAVEGADOR DO CLIENTE. Quando o webhook falha (ou nunca chega) e
// o cliente fecha a aba, ninguém mais converge o pedido: ele fica preso em GERANDO_AUDIO para
// sempre, ou o cliente paga e o produto nunca é liberado. Esta rota é a terceira via, rodando no
// servidor e independente da aba do cliente.
//
// Não duplica regra de negócio: só reusa updateTaskResult (áudio + WhatsApp) e applyPaymentApproval
// (aprovação de pagamento), exatamente os mesmos pontos de convergência das outras duas vias.

// Limites por execução: cada pedido de pagamento custa uma autenticação + uma consulta na Efí, e o
// Edge Runtime tem teto de CPU por requisição. Números baixos de propósito — a rota é feita para
// rodar de tempos em tempos, não para varrer a base inteira de uma vez.
const MAX_AUDIO_ORDERS = 10;
const MAX_PAYMENT_ORDERS = 10;

// Só reconcilia o que já teve tempo de suceder pelo caminho normal — sem essa carência, a rota
// competiria com o polling do cliente que ainda está com a aba aberta e funcionando.
const MIN_AGE_MINUTES = 5;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

function isOlderThan(isoDate, minutes) {
  if (!isoDate) return true; // sem carimbo de tempo, assume antigo (pedido de antes deste campo existir)
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > minutes * 60 * 1000;
}

// Autoriza por token de admin (uso manual pelo painel) OU por segredo compartilhado no cabeçalho
// (uso automático por cron/agendador, que não tem conta de usuário).
async function authorize(req, env) {
  const expectedSecret = readEnv(env, 'RECONCILE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-reconcile-secret') || '';
    if (provided === expectedSecret) return { ok: true, via: 'secret' };
  }

  const admin = await requireAdmin(req, env);
  if (admin.ok) return { ok: true, via: 'admin' };

  return { ok: false, status: admin.status || 401, error: admin.error || 'Não autorizado.' };
}

// Descreve a falha de forma útil para o admin sem vazar mensagem de serviço externo: o `code` do
// Firestore ('permission-denied', 'failed-precondition' para índice faltando, etc.) é o que diz o
// que fazer a seguir, e é informação da nossa própria infraestrutura.
function describeFirestoreError(err) {
  return err?.code ? String(err.code) : 'erro_desconhecido';
}

async function reconcileStuckAudio(env) {
  const result = { checked: 0, completed: 0, retried: 0, stillProcessing: 0, failed: 0 };
  const apiKey = readEnv(env, 'KIE_API_KEY');
  if (!apiKey) {
    result.error = 'KIE_API_KEY não configurada';
    return result;
  }

  // Cada fase falha por conta própria: sem isso, uma query recusada derrubava a rota inteira num 500
  // genérico e escondia qual das duas quebrou.
  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('productionStatus', '==', 'GERANDO_AUDIO'),
      limit(MAX_AUDIO_ORDERS)
    ));
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos em GERANDO_AUDIO:', err.message);
    result.error = `consulta_orders: ${describeFirestoreError(err)}`;
    return result;
  }

  for (const orderDoc of snap.docs) {
    const orderData = orderDoc.data();
    if (!isOlderThan(orderData.sunoRequestedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;

    // O vínculo taskId -> orderId mora em suno_tasks (ver saveTask em src/lib/db.js); o pedido não
    // guarda o taskId, então a busca é pelo caminho inverso. Se houver mais de uma tarefa para o
    // mesmo pedido (uma retentativa automática já rodou e criou uma segunda), não importa qual das
    // duas esta query encontra primeiro — resolveLatestTaskId, logo abaixo, segue a cadeia de
    // retryTaskId a partir de QUALQUER ponto dela e sempre converge na mais recente.
    let taskId = null;
    try {
      const taskSnap = await getDocs(query(
        collection(db, 'suno_tasks'),
        where('orderId', '==', orderDoc.id),
        limit(1)
      ));
      if (!taskSnap.empty) taskId = taskSnap.docs[0].id;
    } catch (err) {
      console.warn('[reconcile] Falha ao buscar a tarefa do pedido:', err.message);
    }

    if (!taskId) {
      // Sem taskId não há o que consultar: a chamada à Kie.ai nunca chegou a ser registrada.
      // Marcar o motivo é o que permite ao admin reprocessar o lote pelo painel.
      result.failed++;
      await recordSunoFailure(orderDoc.id, 'reconcile_sem_taskid');
      continue;
    }

    try {
      // Segue a cadeia de retentativas automáticas até a tarefa mais recente (ver
      // src/lib/suno.js) — o taskId achado acima pode já ter sido substituído por uma retentativa
      // disparada em tempo real por /api/suno/status enquanto o cliente ainda estava na página.
      const effectiveTaskId = await resolveLatestTaskId(taskId);

      const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${effectiveTaskId}`, {
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });

      if (!kieRes.ok) {
        result.stillProcessing++;
        continue;
      }

      const kieData = await kieRes.json();
      const rawStatus = String(kieData?.data?.status || kieData?.data?.state || '').toUpperCase();

      if (rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE')) {
        if (extractAudioTracks(kieData).length > 0) {
          // Mesmo ponto de convergência do webhook e do polling: grava os áudios, marca
          // AUDIO_GERADO e dispara o WhatsApp de "música pronta" (com a própria idempotência dele).
          await updateTaskResult(effectiveTaskId, kieData);
          result.completed++;
          continue;
        }
      }

      if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
        // O cliente já fechou a aba (é por isso que o pedido chegou até aqui) — a retentativa
        // automática é a única chance de recuperar sem intervenção manual do admin.
        const motivo = `kie_status_${rawStatus}`;
        const retry = await maybeAutoRetrySunoFailure({ taskId: effectiveTaskId, orderId: orderDoc.id, env, reason: motivo });
        if (retry.retried) {
          result.retried++;
        } else {
          result.failed++;
          await recordSunoFailure(orderDoc.id, `${motivo}_${retry.reason}`);
        }
        continue;
      }

      result.stillProcessing++;
    } catch (err) {
      console.warn('[reconcile] Erro ao consultar a Kie.ai:', err.message);
      result.stillProcessing++;
    }
  }

  return result;
}

// Reconsulta uma cobrança na Efí e aplica a aprovação se estiver CONCLUIDA — núcleo compartilhado
// pelas duas fases de pagamento abaixo (música/combo e add-on de vídeo avulso). O txid vem do
// próprio documento do pedido, então já é por construção uma cobrança deste pedido — a checagem de
// posse que /api/payments/status faz contra o paymentId da query string não se aplica aqui. O valor
// continua vindo sempre da consulta à Efí, nunca do cliente.
async function checkAndApplyCharge(orderId, txid, env, result) {
  try {
    const charge = await getChargeStatus(txid, env);
    if (charge?.status === 'CONCLUIDA') {
      await applyPaymentApproval(orderId, txid, {
        status: 'approved',
        transaction_amount: Number(charge.valor?.original),
      }, env);
      result.approved++;
    } else {
      result.stillPending++;
    }
  } catch (err) {
    console.warn('[reconcile] Erro ao consultar cobrança na Efí:', err.message);
    result.stillPending++;
  }
}

async function reconcilePendingPayments(env) {
  const result = { checked: 0, approved: 0, stillPending: 0 };

  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('paymentStatus', '==', 'AGUARDANDO_PAGAMENTO'),
      limit(MAX_PAYMENT_ORDERS)
    ));
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos aguardando pagamento:', err.message);
    result.error = `consulta_orders: ${describeFirestoreError(err)}`;
    return result;
  }

  for (const orderDoc of snap.docs) {
    const orderData = orderDoc.data();
    const txid = orderData.paymentIntentId;
    // Sem cobrança gerada não há nada a confirmar — o cliente nem chegou no checkout.
    if (!txid) continue;
    if (!isOlderThan(orderData.updatedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;
    await checkAndApplyCharge(orderDoc.id, txid, env, result);
  }

  return result;
}

// Add-on de vídeo comprado EM SEPARADO (depois da música já paga) nunca escreve `paymentStatus`
// (regra C-09 — o add-on isolado não pode mexer nesse campo). Isso significa que
// reconcilePendingPayments, que só olha `paymentStatus === 'AGUARDANDO_PAGAMENTO'`, NUNCA enxerga
// um pagamento de vídeo avulso que ficou preso — o pedido já está com paymentStatus aprovado (da
// música) muito antes de o vídeo ser comprado. Achado real: "venda só do vídeo que não
// contabilizou" (2026-08-12). Esta é a via de reconciliação equivalente, para essa cobrança.
async function reconcilePendingVideoAddons(env) {
  const result = { checked: 0, approved: 0, stillPending: 0 };

  // paymentIntentSku é campo único (sem where composto) — índice automático, sem entrada em
  // firestore.indexes.json. O filtro de "ainda não liberado" (!videoAddonPaid) e o de idade
  // ficam em memória: a maioria das cobranças com este sku já foi paga com sucesso pela via normal
  // (polling do cliente em /entrega), então a lista só de fato revisada é sempre pequena.
  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('paymentIntentSku', '==', 'video_addon'),
      limit(MAX_PAYMENT_ORDERS * 4)
    ));
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos com add-on de vídeo pendente:', err.message);
    result.error = `consulta_orders: ${describeFirestoreError(err)}`;
    return result;
  }

  for (const orderDoc of snap.docs) {
    if (result.checked >= MAX_PAYMENT_ORDERS) break;

    const orderData = orderDoc.data();
    if (orderData.videoAddonPaid) continue; // já liberado — nada a fazer
    const txid = orderData.paymentIntentId;
    if (!txid) continue;
    if (!isOlderThan(orderData.updatedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;
    await checkAndApplyCharge(orderDoc.id, txid, env, result);
  }

  return result;
}

// Rascunho de sessão do agente de WhatsApp (src/lib/whatsappAgent.js) — documento
// `session_{telefone}` gravado em `orders` com orderNumber SESSION-* e productionStatus RASCUNHO
// enquanto o cliente ainda tá conversando, sem prazo de expiração. Se ele nunca voltar, o rascunho
// fica pra sempre solto na coleção. Exclusão física (não lógica) de propósito: nunca virou pedido
// de verdade, não tem suno_tasks nem pagamento associado — não é o "pedido" que a regra de
// database.md pede pra soft-delete.
const ABANDONED_SESSION_MAX_AGE_HOURS = 24;
const MAX_SESSIONS_CLEANED = 30;

async function cleanupAbandonedWhatsAppSessions(env) {
  const result = { checked: 0, deleted: 0 };

  let snap;
  try {
    snap = await getDocs(query(
      collection(db, 'orders'),
      where('productionStatus', '==', 'RASCUNHO'),
      limit(MAX_SESSIONS_CLEANED * 2)
    ));
  } catch (err) {
    console.warn('[reconcile] Falha ao listar sessões de WhatsApp em rascunho:', err.message);
    result.error = `consulta_orders: ${describeFirestoreError(err)}`;
    return result;
  }

  for (const orderDoc of snap.docs) {
    if (result.deleted >= MAX_SESSIONS_CLEANED) break;
    const data = orderDoc.data();
    if (!String(data.orderNumber || '').startsWith('SESSION-')) continue;
    if (!isOlderThan(data.updatedAt, ABANDONED_SESSION_MAX_AGE_HOURS * 60)) continue;

    result.checked++;
    try {
      await deleteDoc(orderDoc.ref);
      result.deleted++;
    } catch (err) {
      console.warn('[reconcile] Falha ao excluir sessão de WhatsApp abandonada:', err.message);
    }
  }

  return result;
}

export async function POST(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await authorize(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    // Uma fase nunca derruba a outra: se a consulta de música falhar, a de pagamento ainda roda (e
    // vice-versa). O erro de cada uma volta no próprio bloco, para o admin ver o que aconteceu em
    // vez de um 500 sem explicação.
    let audio;
    try {
      audio = await reconcileStuckAudio(env);
    } catch (err) {
      console.error('[reconcile] Falha inesperada na fase de música:', err.message);
      audio = { checked: 0, completed: 0, retried: 0, stillProcessing: 0, failed: 0, error: `inesperado: ${describeFirestoreError(err)}` };
    }

    let payments;
    try {
      payments = await reconcilePendingPayments(env);
    } catch (err) {
      console.error('[reconcile] Falha inesperada na fase de pagamento:', err.message);
      payments = { checked: 0, approved: 0, stillPending: 0, error: `inesperado: ${describeFirestoreError(err)}` };
    }

    // Fase própria (não dentro de reconcilePendingPayments) porque o add-on de vídeo avulso nunca
    // toca paymentStatus (C-09) — teria que ser encontrado de um jeito diferente de qualquer forma,
    // então isolar em outra função e outro try/catch segue o mesmo padrão das outras duas fases.
    let videoAddon;
    try {
      videoAddon = await reconcilePendingVideoAddons(env);
    } catch (err) {
      console.error('[reconcile] Falha inesperada na fase de add-on de vídeo:', err.message);
      videoAddon = { checked: 0, approved: 0, stillPending: 0, error: `inesperado: ${describeFirestoreError(err)}` };
    }

    let abandonedSessions;
    try {
      abandonedSessions = await cleanupAbandonedWhatsAppSessions(env);
    } catch (err) {
      console.error('[reconcile] Falha inesperada na limpeza de sessões de WhatsApp:', err.message);
      abandonedSessions = { checked: 0, deleted: 0, error: `inesperado: ${describeFirestoreError(err)}` };
    }

    console.log('[reconcile] Resultado:', JSON.stringify({ audio, payments, videoAddon, abandonedSessions }));

    return NextResponse.json({ audio, payments, videoAddon, abandonedSessions });
  } catch (error) {
    console.error('[reconcile] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao reconciliar pedidos.' }, { status: 500 });
  }
}
