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

// Campos de acesso que indicam que o add-on daquele SKU já foi liberado.
const ADDON_ACCESS = {
  video_addon: ['has_video_access', 'videoAddonPaid'],
  playback_addon: ['has_playback_access', 'playbackAddonPaid'],
  carta_addon: ['has_carta_access', 'cartaAddonPaid'],
  retrospectiva_addon: ['has_retrospectiva_access', 'retrospectivaAddonPaid'],
  karaoke_addon: ['has_karaoke_access', 'karaokeAddonPaid'],
};
const JANELA_PIX_HORAS = 48;
const MAX_PIX_CONSULTADOS = 30;
const LOTE_CONSULTA_EFI = 5;

// Antes: pegava só os 10 pedidos AGUARDANDO_PAGAMENTO com updated_at mais recente e descartava os
// de menos de 3min. Com muitos PIX gerados e abandonados, o pedido que de fato pagou saía desse
// top 10 em minutos e nunca mais era consultado — e só o txid ATUAL era verificado. Na prática o
// cron não convergia quase nada e sobrava o botão manual do painel.
//
// Agora parte de order_payment_intents (todo PIX gerado fica registrado ali, inclusive cobranças
// antigas do mesmo pedido e add-ons), mesma base que o botão "checar" do painel usa: últimas 48h,
// prioriza quem copiou o PIX e consulta até 30 cobranças na Efí em lotes paralelos de 5.
async function reconcilePendingPayments(env) {
  const result = { checked: 0, approved: 0, stillPending: 0, viaPixCopiado: 0, candidatos: 0 };

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    result.error = 'Supabase não inicializado';
    return result;
  }

  try {
    const agora = Date.now();
    const desde = new Date(agora - JANELA_PIX_HORAS * 3600000).toISOString();
    const ate = new Date(agora - MIN_AGE_MINUTES * 60000).toISOString();

    const { data: intents, error: intentsErr } = await supabase
      .from('order_payment_intents')
      .select('order_id,txid,sku,created_at')
      .eq('provider', 'efi')
      .gte('created_at', desde)
      .lte('created_at', ate)
      .order('created_at', { ascending: false })
      .limit(300);
    if (intentsErr) throw new Error(intentsErr.message);
    if (!Array.isArray(intents) || intents.length === 0) return result;

    const orderIds = [...new Set(intents.map((i) => i.order_id).filter(Boolean))];
    const pedidos = new Map();
    for (let i = 0; i < orderIds.length; i += 80) {
      const { data, error } = await supabase
        .from('orders')
        .select('id,payment_status,deleted_at,has_video_access,has_playback_access,has_carta_access,has_retrospectiva_access,has_karaoke_access,extras')
        .in('id', orderIds.slice(i, i + 80));
      if (error) throw new Error(error.message);
      for (const row of data || []) pedidos.set(row.id, row);
    }

    const vistos = new Set();
    const candidatos = [];
    for (const intent of intents) {
      const txid = String(intent.txid || '').trim();
      if (!txid || vistos.has(txid) || txid.startsWith('NSMUSIC')) continue;
      vistos.add(txid);

      const pedido = pedidos.get(intent.order_id);
      if (!pedido || pedido.deleted_at) continue;
      const extras = pedido.extras || {};

      const acesso = ADDON_ACCESS[intent.sku];
      if (acesso) {
        if (pedido[acesso[0]] || extras[acesso[1]]) continue;
      } else if (pedido.payment_status === 'PAGO' || pedido.payment_status === 'PAGAMENTO_APROVADO') {
        continue;
      }

      candidatos.push({ orderId: pedido.id, txid, copiou: Boolean(extras.pixCopiedAt) });
    }

    // Quem copiou o PIX tem muito mais chance de ter pago: vai na frente (ordem estável por data).
    candidatos.sort((a, b) => Number(b.copiou) - Number(a.copiou));
    result.candidatos = candidatos.length;

    const aConsultar = candidatos.slice(0, MAX_PIX_CONSULTADOS);
    for (let i = 0; i < aConsultar.length; i += LOTE_CONSULTA_EFI) {
      const lote = aConsultar.slice(i, i + LOTE_CONSULTA_EFI);
      await Promise.all(lote.map(async (c) => {
        result.checked++;
        if (c.copiou) result.viaPixCopiado++;
        await checkAndApplyCharge(c.orderId, c.txid, env, result);
      }));
    }
  } catch (err) {
    console.warn('[reconcile] Falha ao reconciliar PIX pendentes:', err.message);
    result.error = `reconcile_pix: ${err.message}`;
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
