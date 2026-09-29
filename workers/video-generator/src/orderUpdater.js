if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketPolyfill {};
}
import { createClient } from '@supabase/supabase-js';

/**
 * Constrói o objeto de atualização compatível com o schema do Postgres do Supabase.
 */
export function buildOrderUpdates({ status, progress, videoUrl, error }) {
  const nowIso = new Date().toISOString();
  const updates = {
    updated_at: nowIso,
  };

  if (status) {
    updates.video_status = status;
  }
  if (videoUrl !== undefined) {
    updates.video_url = videoUrl;
  }
  if (error !== undefined) {
    updates.video_error = error ? String(error) : null;
  } else if (status === 'CONCLUIDO') {
    updates.video_error = null;
  }

  return updates;
}

let cachedSupabase = null;

function getSupabase(config = process.env) {
  const url = config.SUPABASE_URL;
  const key = config.SUPABASE_SERVICE_ROLE_KEY || config.SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  if (!cachedSupabase) {
    cachedSupabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return cachedSupabase;
}

/**
 * Atualiza o status e detalhes do vídeo no pedido no Supabase.
 *
 * @param {string} orderId - ID do pedido
 * @param {Object} params - { status, progress, videoUrl, error }
 * @param {Object} [config] - Configurações de ambiente
 */
export async function updateOrderStatus(orderId, params, config = process.env) {
  if (!orderId) {
    throw new Error('ID do pedido obrigatório');
  }

  const updates = buildOrderUpdates(params);
  const supabase = getSupabase(config);

  if (!supabase) {
    console.warn(`[OrderUpdater] Supabase não configurado. Pulo de persistência para o pedido ${orderId}`);
    return updates;
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .update(updates)
      .eq('id', orderId);

    if (error) {
      console.error(`[OrderUpdater] Erro ao atualizar pedido ${orderId} no Supabase:`, error);
      throw error;
    }

    console.log(`[OrderUpdater] Pedido ${orderId} atualizado no Supabase -> status: ${updates.video_status}`);
    return data;
  } catch (err) {
    console.error(`[OrderUpdater] Falha na chamada ao Supabase para o pedido ${orderId}:`, err?.message);
    throw err;
  }
}
