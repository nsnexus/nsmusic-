import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { collection, query, where, limit, getDocs, doc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { updateTaskResult, extractAudioTracks } from '@/lib/db';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';
import { requireAdmin } from '@/lib/auth';

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

async function reconcileStuckAudio(apiKey) {
  const result = { checked: 0, completed: 0, stillProcessing: 0, failed: 0 };
  if (!apiKey) {
    result.error = 'KIE_API_KEY não configurada';
    return result;
  }

  const snap = await getDocs(query(
    collection(db, 'orders'),
    where('productionStatus', '==', 'GERANDO_AUDIO'),
    limit(MAX_AUDIO_ORDERS)
  ));

  for (const orderDoc of snap.docs) {
    const orderData = orderDoc.data();
    if (!isOlderThan(orderData.sunoRequestedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;

    // O vínculo taskId -> orderId mora em suno_tasks (ver saveTask em src/lib/db.js); o pedido não
    // guarda o taskId, então a busca é pelo caminho inverso.
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
      await updateDoc(doc(db, 'orders', orderDoc.id), {
        sunoError: 'reconcile_sem_taskid',
        sunoErrorAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).catch((e) => console.warn('[reconcile] Falha ao marcar pedido sem taskId:', e.message));
      continue;
    }

    try {
      const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
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
          await updateTaskResult(taskId, kieData);
          result.completed++;
          continue;
        }
      }

      if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
        result.failed++;
        await updateDoc(doc(db, 'orders', orderDoc.id), {
          sunoError: `kie_status_${rawStatus}`,
          sunoErrorAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }).catch((e) => console.warn('[reconcile] Falha ao marcar erro da Kie.ai:', e.message));
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

async function reconcilePendingPayments(env) {
  const result = { checked: 0, approved: 0, stillPending: 0 };

  const snap = await getDocs(query(
    collection(db, 'orders'),
    where('paymentStatus', '==', 'AGUARDANDO_PAGAMENTO'),
    limit(MAX_PAYMENT_ORDERS)
  ));

  for (const orderDoc of snap.docs) {
    const orderData = orderDoc.data();
    const txid = orderData.paymentIntentId;
    // Sem cobrança gerada não há nada a confirmar — o cliente nem chegou no checkout.
    if (!txid) continue;
    if (!isOlderThan(orderData.updatedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;

    try {
      const charge = await getChargeStatus(txid, env);
      if (charge?.status === 'CONCLUIDA') {
        // O txid veio do próprio documento do pedido, então já é por construção uma cobrança deste
        // pedido — a checagem de posse que /api/payments/status faz contra o paymentId da query
        // string não se aplica aqui. O valor continua vindo da consulta à Efí, nunca do cliente.
        await applyPaymentApproval(orderDoc.id, txid, {
          status: 'approved',
          transaction_amount: Number(charge.valor?.original),
        });
        result.approved++;
      } else {
        result.stillPending++;
      }
    } catch (err) {
      console.warn('[reconcile] Erro ao consultar cobrança na Efí:', err.message);
      result.stillPending++;
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

    const apiKey = readEnv(env, 'KIE_API_KEY');

    const audio = await reconcileStuckAudio(apiKey);
    const payments = await reconcilePendingPayments(env);

    console.log('[reconcile] Resultado:', JSON.stringify({ audio, payments }));

    return NextResponse.json({ audio, payments });
  } catch (error) {
    console.error('[reconcile] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao reconciliar pedidos.' }, { status: 500 });
  }
}
