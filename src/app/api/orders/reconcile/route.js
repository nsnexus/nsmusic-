import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { getTask, updateTaskResult, extractAudioTracks } from '@/lib/db';
import { applyPaymentApproval } from '@/lib/payments';
import { getChargeStatus } from '@/lib/efi';
import { requireAdmin } from '@/lib/auth';
import { resolveLatestTaskId, maybeAutoRetrySunoFailure, recordSunoFailure, PROVIDER_KIE } from '@/lib/suno';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const MAX_AUDIO_ORDERS = 10;
const MAX_PAYMENT_ORDERS = 10;
const MIN_AGE_MINUTES = 3;
const STUCK_RETRY_MINUTES = 3;

function readEnv(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}

function isOlderThan(isoDate, minutes) {
  if (!isoDate) return true;
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return true;
  return Date.now() - ts > minutes * 60 * 1000;
}

async function authorize(req, env) {
  const expectedSecret = readEnv(env, 'RECONCILE_SECRET');
  if (expectedSecret) {
    const provided = req.headers.get('x-reconcile-secret') || '';
    if (provided === expectedSecret) return { ok: true, via: 'secret' };
  }

  const admin = await requireAdmin(req, env);
  if (admin.ok) return { ok: true, via: 'admin_token' };

  return { ok: false, status: admin.status || 401, error: admin.error || 'Não autorizado.' };
}

async function forceStuckRetry(orderId, effectiveTaskId, env, result, motivo, preferredProvider = null) {
  const retry = await maybeAutoRetrySunoFailure({
    taskId: effectiveTaskId,
    orderId,
    env,
    reason: motivo,
    preferredProvider
  });
  if (retry.retried) {
    result.retried++;
  } else {
    result.failed++;
    await recordSunoFailure(orderId, `${motivo}_${retry.reason}`, env);
  }
}

async function reconcileStuckAudio(env) {
  const result = { checked: 0, completed: 0, retried: 0, stillProcessing: 0, failed: 0 };
  const kieApiKey = readEnv(env, 'KIE_API_KEY');
  const unificallyApiKey = readEnv(env, 'UNIFICALLY_API_KEY');

  if (!kieApiKey && !unificallyApiKey) {
    result.error = 'Nenhuma chave de IA (KIE_API_KEY ou UNIFICALLY_API_KEY) configurada';
    return result;
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    result.error = 'Supabase não inicializado';
    return result;
  }

  let orders = [];
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('production_status', 'GERANDO_AUDIO')
      .is('deleted_at', null)
      .limit(MAX_AUDIO_ORDERS);

    if (error) throw error;
    orders = (data || []).map(mapSupabaseOrderToFirestore);
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos em GERANDO_AUDIO:', err.message);
    result.error = `consulta_orders: ${err.message}`;
    return result;
  }

  for (const orderData of orders) {
    if (!isOlderThan(orderData.sunoRequestedAt, MIN_AGE_MINUTES)) continue;

    result.checked++;

    let taskId = orderData.sunoTaskId || null;
    if (!taskId) {
      try {
        const { data: taskData } = await supabase
          .from('suno_tasks')
          .select('id')
          .eq('order_id', orderData.id)
          .limit(1);

        if (taskData && taskData[0]) {
          taskId = taskData[0].id;
        }
      } catch (err) {
        console.warn('[reconcile] Falha ao buscar a tarefa do pedido:', err.message);
      }
    }

    if (!taskId) {
      result.failed++;
      await recordSunoFailure(orderData.id, 'reconcile_sem_taskid', env);
      continue;
    }

    try {
      const effectiveTaskId = await resolveLatestTaskId(taskId, env);
      const task = await getTask(effectiveTaskId, env);
      const isUnif = task?.provider === 'unifically' || orderData.sunoProvider === 'unifically';

      // 1. Processamento de tarefa da Unifically
      if (isUnif && unificallyApiKey) {
        const unifRes = await fetch(`https://api.unifically.com/v1/tasks/${effectiveTaskId}`, {
          headers: { Authorization: `Bearer ${unificallyApiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (!unifRes.ok) {
          if (isOlderThan(orderData.sunoRequestedAt, STUCK_RETRY_MINUTES) || unifRes.status === 402) {
            await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `unifically_http_${unifRes.status}`, PROVIDER_KIE);
          } else {
            result.stillProcessing++;
          }
          continue;
        }

        const unifData = await unifRes.json();
        const taskData = unifData?.data || unifData;
        const rawStatus = String(taskData?.status || unifData?.status || '').toLowerCase();

        if (rawStatus === 'completed' || rawStatus === 'succeeded' || rawStatus === 'success') {
          const tracksArray = extractAudioTracks(unifData).length > 0
            ? extractAudioTracks(unifData)
            : extractAudioTracks(taskData);

          if (tracksArray.length > 0) {
            await updateTaskResult(effectiveTaskId, unifData, orderData.id, env);
            result.completed++;
            continue;
          }
        }

        if (rawStatus === 'failed' || rawStatus === 'error') {
          await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `unifically_status_${rawStatus}`, PROVIDER_KIE);
          continue;
        }

        if (isOlderThan(orderData.sunoRequestedAt, STUCK_RETRY_MINUTES)) {
          await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `unifically_travado_${rawStatus || 'vazio'}`, PROVIDER_KIE);
        } else {
          result.stillProcessing++;
        }
        continue;
      }

      // 2. Processamento de tarefa da Kie.ai
      if (kieApiKey) {
        const kieRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${effectiveTaskId}`, {
          headers: { Authorization: `Bearer ${kieApiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (!kieRes.ok) {
          if (isOlderThan(orderData.sunoRequestedAt, 6)) {
            await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `kie_http_${kieRes.status}`);
          } else {
            result.stillProcessing++;
          }
          continue;
        }

        const kieData = await kieRes.json();
        const rawStatus = String(
          (Array.isArray(kieData?.data) ? kieData.data[0]?.status : (kieData?.data?.status || kieData?.data?.state))
          || kieData?.status
          || kieData?.state
          || kieData?.data?.response?.status
          || ''
        ).toUpperCase();

        const tracksArray = extractAudioTracks(kieData);
        const hasRealAudio = tracksArray.length > 0 && tracksArray.some(t => {
          const u = t.audio_url || t.audioUrl || '';
          return typeof u === 'string' && u.startsWith('http');
        });
        const isReady = rawStatus.includes('SUCCESS') || rawStatus.includes('COMPLETE') || rawStatus.includes('FINISH') || rawStatus.includes('DONE');

        if (isReady || hasRealAudio) {
          if (tracksArray.length > 0) {
            await updateTaskResult(effectiveTaskId, kieData, orderData.id, env);
            result.completed++;
            continue;
          }
        }

        if (rawStatus.includes('FAIL') || rawStatus.includes('ERROR')) {
          await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `kie_status_${rawStatus}`);
          continue;
        }

        if (isOlderThan(orderData.sunoRequestedAt, 6)) {
          await forceStuckRetry(orderData.id, effectiveTaskId, env, result, `kie_status_travado_${rawStatus || 'vazio'}`);
        } else {
          result.stillProcessing++;
        }
      }
    } catch (err) {
      console.warn('[reconcile] Erro ao consultar provedor de música:', err.message);
      result.stillProcessing++;
    }
  }

  return result;
}

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
  const result = { checked: 0, approved: 0, stillPending: 0, viaPixCopiado: 0 };
  const jaVerificados = new Set();

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    result.error = 'Supabase não inicializado';
    return result;
  }

  const verificar = async (orderData) => {
    if (jaVerificados.has(orderData.id)) return;
    jaVerificados.add(orderData.id);

    const txid = orderData.paymentIntentId || orderData.extras?.paymentIntentId;
    if (!txid) return;
    if (!isOlderThan(orderData.updatedAt, MIN_AGE_MINUTES)) return;

    result.checked++;
    await checkAndApplyCharge(orderData.id, txid, env, result);
  };

  try {
    const { data: rows, error } = await supabase
      .from('orders')
      .select('*')
      .eq('payment_status', 'AGUARDANDO_PAGAMENTO')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(MAX_PAYMENT_ORDERS);

    if (error) throw error;

    const orders = (rows || []).map(mapSupabaseOrderToFirestore);
    for (const orderData of orders) {
      await verificar(orderData);
    }
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos aguardando pagamento:', err.message);
    result.error = `consulta_orders: ${err.message}`;
  }

  return result;
}

async function reconcilePendingVideoAddons(env) {
  const result = { checked: 0, approved: 0, stillPending: 0 };
  const supabase = getSupabaseEdge(env);
  if (!supabase) return result;

  try {
    const { data: rows, error } = await supabase
      .from('orders')
      .select('*')
      .is('deleted_at', null)
      .limit(MAX_PAYMENT_ORDERS * 4);

    if (error) throw error;

    const orders = (rows || []).map(mapSupabaseOrderToFirestore);
    for (const orderData of orders) {
      if (result.checked >= MAX_PAYMENT_ORDERS) break;

      const sku = orderData.paymentIntentSku || orderData.extras?.paymentIntentSku;
      if (sku !== 'video_addon') continue;
      if (orderData.videoAddonPaid || orderData.extras?.videoAddonPaid) continue;
      const txid = orderData.paymentIntentId || orderData.extras?.paymentIntentId;
      if (!txid) continue;
      if (!isOlderThan(orderData.updatedAt, MIN_AGE_MINUTES)) continue;

      result.checked++;
      await checkAndApplyCharge(orderData.id, txid, env, result);
    }
  } catch (err) {
    console.warn('[reconcile] Falha ao listar pedidos com add-on de vídeo pendente:', err.message);
    result.error = `consulta_orders: ${err.message}`;
  }

  return result;
}

async function cleanupAbandonedWhatsAppSessions(env) {
  const result = { checked: 0, deleted: 0 };
  const supabase = getSupabaseEdge(env);
  if (!supabase) return result;

  try {
    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('orders')
      .delete()
      .eq('production_status', 'RASCUNHO')
      .ilike('order_number', 'SESSION-%')
      .lt('updated_at', cutoffDate)
      .select('id');

    if (!error && Array.isArray(data)) {
      result.deleted = data.length;
      result.checked = data.length;
    }
  } catch (err) {
    console.warn('[reconcile] Falha ao excluir sessão de WhatsApp abandonada:', err.message);
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

    const fase = new URL(req.url).searchParams.get('fase') || 'tudo';
    const fazPagamentos = fase === 'tudo' || fase === 'pagamentos';
    const fazAudio = fase === 'tudo' || fase === 'audio';

    const resposta = { fase };

    if (fazPagamentos) {
      try {
        resposta.payments = await reconcilePendingPayments(env);
      } catch (err) {
        console.error('[reconcile] Falha inesperada na fase de pagamento:', err.message);
        resposta.payments = { checked: 0, approved: 0, stillPending: 0, error: `inesperado: ${err.message}` };
      }

      try {
        resposta.videoAddon = await reconcilePendingVideoAddons(env);
      } catch (err) {
        console.error('[reconcile] Falha inesperada na fase de add-on de vídeo:', err.message);
        resposta.videoAddon = { checked: 0, approved: 0, stillPending: 0, error: `inesperado: ${err.message}` };
      }
    }

    if (fazAudio) {
      try {
        resposta.audio = await reconcileStuckAudio(env);
      } catch (err) {
        console.error('[reconcile] Falha inesperada na fase de música:', err.message);
        resposta.audio = { checked: 0, completed: 0, retried: 0, stillProcessing: 0, failed: 0, error: `inesperado: ${err.message}` };
      }

      try {
        resposta.abandonedSessions = await cleanupAbandonedWhatsAppSessions(env);
      } catch (err) {
        console.error('[reconcile] Falha inesperada na limpeza de sessões de WhatsApp:', err.message);
        resposta.abandonedSessions = { checked: 0, deleted: 0, error: `inesperado: ${err.message}` };
      }
    }

    console.log('[reconcile] Resultado:', JSON.stringify(resposta));

    return NextResponse.json(resposta);
  } catch (error) {
    console.error('[reconcile] Erro geral:', error.message);
    return NextResponse.json({ error: 'Falha ao reconciliar pedidos.' }, { status: 500 });
  }
}
