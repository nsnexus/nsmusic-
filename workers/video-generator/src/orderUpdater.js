if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = class WebSocketPolyfill {};
}
import { createClient } from '@supabase/supabase-js';

/**
 * Constrói o objeto de atualização compatível com o schema do Postgres do Supabase.
 */
export function buildOrderUpdates(params = {}) {
  const nowIso = new Date().toISOString();
  const updates = {
    updated_at: nowIso,
  };

  if (params.status) {
    updates.video_status = params.status;
  }
  if (params.videoUrl !== undefined) {
    updates.video_url = params.videoUrl;
  }
  if (params.error !== undefined) {
    updates.video_error = params.error ? String(params.error) : null;
  } else if (params.status === 'CONCLUIDO') {
    updates.video_error = null;
  }

  // Suporte a campos de karaokê
  if (params.karaokeStatus !== undefined) {
    updates.karaoke_status = params.karaokeStatus;
  }
  if (params.karaokeProgress !== undefined) {
    updates.karaoke_progress = params.karaokeProgress;
  }
  if (params.karaokeUrl !== undefined) {
    updates.karaoke_url = params.karaokeUrl;
  }
  if (params.karaokeError !== undefined) {
    updates.karaoke_error = params.karaokeError;
  }
  if (params.hasKaraokeAccess !== undefined) {
    updates.has_karaoke_access = params.hasKaraokeAccess;
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
