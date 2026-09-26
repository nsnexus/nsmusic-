import { getSupabaseEdge } from './supabase-edge.js';

// Normaliza data para string ISO aceita pelo Postgres (timestamptz)
function toIso(val) {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return null;
    }
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  return null;
}

// Mapeia os dados do Firestore para as colunas da tabela `orders` do Supabase
export function mapFirestoreOrderToSupabase(id, data = {}) {
  const knownKeys = new Set([
    'orderNumber', 'customerName', 'customerPhone', 'customerEmail', 'userId',
    'honoreeName', 'recipientType', 'relationship', 'occasion', 'story',
    'importantMoments', 'musicStyle', 'musicMood', 'voiceType', 'lyrics',
    'sunoPrompt', 'productionStatus', 'sunoTaskId', 'sunoProvider',
    'sunoGenerationCount', 'sunoRequestedAt', 'sunoError', 'audioUrl',
    'audioFiles', 'audioIds', 'coverUrl', 'audioArchivedAt',
    'audioArchiveFailedAt', 'audioRefreshedAt', 'audioRefreshFailed',
    'paymentStatus', 'paidAt', 'hasVideoAccess', 'hasCartaAccess',
    'hasRetrospectivaAccess', 'hasPlaybackAccess', 'videoUrl', 'videoStatus',
    'videoError', 'playbackUrl', 'playbackStatus', 'playbackError',
    'cartaTexto', 'cartaTemaEscolhido', 'cartaMusicaUrl', 'homenagemMusicaUrl',
    'retrospectiva', 'slideshowImages', 'whatsappRequested', 'whatsappSent',
    'whatsappSentAt', 'readyTemplateSent', 'readyTemplateSentAt',
    'paymentWhatsappSent', 'recoveryStage', 'humanTakeover',
    'previewListenedAt', 'termsAccepted', 'termsAcceptedAt',
    'createdAt', 'updatedAt', 'deletedAt'
  ]);

  // Junta quaisquer campos extras não mapeados em JSONB
  const extras = {};
  for (const [key, val] of Object.entries(data)) {
    if (!knownKeys.has(key)) {
      extras[key] = val;
    }
  }

  return {
    id,
    order_number: data.orderNumber || `NS-${id.slice(0, 8)}`,
    customer_name: data.customerName || null,
    customer_phone: data.customerPhone || null,
    customer_email: data.customerEmail || null,
    user_id: data.userId || null,
    honoree_name: data.honoreeName || null,
    recipient_type: data.recipientType || null,
    relationship: data.relationship || null,
    occasion: data.occasion || null,
    story: data.story || null,
    important_moments: data.importantMoments || null,
    music_style: data.musicStyle || null,
    music_mood: data.musicMood || null,
    voice_type: data.voiceType || null,
    lyrics: data.lyrics || null,
    suno_prompt: data.sunoPrompt || null,
    production_status: data.productionStatus || 'RASCUNHO',
    suno_task_id: data.sunoTaskId || null,
    suno_provider: data.sunoProvider || null,
    suno_generation_count: Number(data.sunoGenerationCount) || 0,
    suno_requested_at: toIso(data.sunoRequestedAt),
    suno_error: data.sunoError ? String(data.sunoError) : null,
    audio_url: data.audioUrl || null,
    audio_files: Array.isArray(data.audioFiles) ? data.audioFiles.filter(Boolean) : [],
    audio_ids: Array.isArray(data.audioIds) ? data.audioIds.filter(Boolean) : [],
    cover_url: data.coverUrl || null,
    audio_archived_at: toIso(data.audioArchivedAt),
    audio_archive_failed_at: toIso(data.audioArchiveFailedAt),
    audio_refreshed_at: toIso(data.audioRefreshedAt),
    audio_refresh_failed: data.audioRefreshFailed ? String(data.audioRefreshFailed) : null,
    payment_status: data.paymentStatus || 'AGUARDANDO_PAGAMENTO',
    paid_at: toIso(data.paidAt),
    has_video_access: Boolean(data.hasVideoAccess),
    has_carta_access: Boolean(data.hasCartaAccess),
    has_retrospectiva_access: Boolean(data.hasRetrospectivaAccess),
    has_playback_access: Boolean(data.hasPlaybackAccess),
    video_url: data.videoUrl || null,
    video_status: data.videoStatus || null,
    video_error: data.videoError ? String(data.videoError) : null,
    playback_url: data.playbackUrl || null,
    playback_status: data.playbackStatus || null,
    playback_error: data.playbackError ? String(data.playbackError) : null,
    carta_texto: data.cartaTexto || null,
    carta_tema_escolhido: data.cartaTemaEscolhido || null,
    carta_musica_url: data.cartaMusicaUrl || null,
    homenagem_musica_url: data.homenagemMusicaUrl || null,
    retrospectiva: (data.retrospectiva && typeof data.retrospectiva === 'object') ? data.retrospectiva : null,
    slideshow_images: Array.isArray(data.slideshowImages) ? data.slideshowImages.filter(Boolean) : [],
    whatsapp_requested: Boolean(data.whatsappRequested),
    whatsapp_sent: Boolean(data.whatsappSent),
    whatsapp_sent_at: toIso(data.whatsappSentAt),
    ready_template_sent: Boolean(data.readyTemplateSent),
    ready_template_sent_at: toIso(data.readyTemplateSentAt),
    payment_whatsapp_sent: Boolean(data.paymentWhatsappSent),
    recovery_stage: Number(data.recoveryStage) || 0,
    human_takeover: Boolean(data.humanTakeover),
    preview_listened_at: toIso(data.previewListenedAt),
    terms_accepted: Boolean(data.termsAccepted),
    terms_accepted_at: toIso(data.termsAcceptedAt),
    created_at: toIso(data.createdAt) || new Date().toISOString(),
    updated_at: toIso(data.updatedAt) || new Date().toISOString(),
    deleted_at: toIso(data.deletedAt),
    extras
  };
}

// Mapeia uma linha do Supabase (snake_case) de volta para o formato padrão do objeto de pedido (camelCase)
export function mapSupabaseOrderToFirestore(row) {
  if (!row || typeof row !== 'object') return null;

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerName: row.customer_name || 'Cliente',
    customerPhone: row.customer_phone || '',
    customerEmail: row.customer_email || '',
    userId: row.user_id || null,
    honoreeName: row.honoree_name || '',
    recipientType: row.recipient_type || '',
    relationship: row.relationship || '',
    occasion: row.occasion || '',
    story: row.story || '',
    importantMoments: row.important_moments || '',
    musicStyle: row.music_style || '',
    musicMood: row.music_mood || '',
    voiceType: row.voice_type || '',
    lyrics: row.lyrics || '',
    sunoPrompt: row.suno_prompt || '',
    productionStatus: row.production_status || 'RASCUNHO',
    sunoTaskId: row.suno_task_id || null,
    sunoProvider: row.suno_provider || null,
    sunoGenerationCount: Number(row.suno_generation_count) || 0,
    sunoRequestedAt: row.suno_requested_at || null,
    sunoError: row.suno_error || null,
    audioUrl: row.audio_url || null,
    audioFiles: Array.isArray(row.audio_files) ? row.audio_files : [],
    audioIds: Array.isArray(row.audio_ids) ? row.audio_ids : [],
    coverUrl: row.cover_url || null,
    audioArchivedAt: row.audio_archived_at || null,
    audioArchiveFailedAt: row.audio_archive_failed_at || null,
    audioRefreshedAt: row.audio_refreshed_at || null,
    audioRefreshFailed: row.audio_refresh_failed || null,
    paymentStatus: row.payment_status || 'AGUARDANDO_PAGAMENTO',
    paidAt: row.paid_at || null,
    hasVideoAccess: Boolean(row.has_video_access),
    hasCartaAccess: Boolean(row.has_carta_access),
    hasRetrospectivaAccess: Boolean(row.has_retrospectiva_access),
    hasPlaybackAccess: Boolean(row.has_playback_access),
    videoUrl: row.video_url || null,
    videoStatus: row.video_status || null,
    videoError: row.video_error || null,
    playbackUrl: row.playback_url || null,
    playbackStatus: row.playback_status || null,
    playbackError: row.playback_error || null,
    cartaTexto: row.carta_texto || null,
    cartaTemaEscolhido: row.carta_tema_escolhido || null,
    cartaMusicaUrl: row.carta_musica_url || null,
    homenagemMusicaUrl: row.homenagem_musica_url || null,
    retrospectiva: row.retrospectiva || null,
    slideshowImages: Array.isArray(row.slideshow_images) ? row.slideshow_images : [],
    whatsappRequested: Boolean(row.whatsapp_requested),
    whatsappSent: Boolean(row.whatsapp_sent),
    whatsappSentAt: row.whatsapp_sent_at || null,
    readyTemplateSent: Boolean(row.ready_template_sent),
    readyTemplateSentAt: row.ready_template_sent_at || null,
    paymentWhatsappSent: Boolean(row.payment_whatsapp_sent),
    recoveryStage: Number(row.recovery_stage) || 0,
    humanTakeover: Boolean(row.human_takeover),
    previewListenedAt: row.preview_listened_at || null,
    termsAccepted: Boolean(row.terms_accepted),
    termsAcceptedAt: row.terms_accepted_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    deletedAt: row.deleted_at || null,
    ...(row.extras && typeof row.extras === 'object' ? row.extras : {}),
  };
}

/**
 * Espelha um pedido para o Supabase (Dual-Write seguro).
 * NUNCA lança erro: falhas no Supabase são registradas apenas como log de aviso
 * e não interferem na operação normal do Firebase.
 */
export async function mirrorOrderToSupabase(orderId, orderData, env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { success: false, reason: 'not_configured' };

    const mapped = mapFirestoreOrderToSupabase(orderId, orderData);
    const { error } = await supabase
      .from('orders')
      .upsert(mapped, { onConflict: 'id' });

    if (error) {
      console.warn(`[supabase-sync] Erro ao espelhar pedido ${orderId}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.warn(`[supabase-sync] Exceção ao espelhar pedido ${orderId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Espelha uma transação confirmada para a tabela `payments` no Supabase.
 */
export async function mirrorPaymentToSupabase({ orderId, kind, sku, txid, amount, paidAt }, env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { success: false, reason: 'not_configured' };

    const validKinds = new Set(['musica', 'video', 'carta', 'retrospectiva', 'playback']);
    const normalizedKind = validKinds.has(kind) ? kind : 'musica';

    const payload = {
      order_id: orderId,
      kind: normalizedKind,
      sku: sku || null,
      txid: String(txid),
      amount: Number(amount) || 0,
      paid_at: toIso(paidAt) || new Date().toISOString()
    };

    const { error } = await supabase
      .from('payments')
      .upsert(payload, { onConflict: 'txid,kind' });

    if (error) {
      console.warn(`[supabase-sync] Erro ao espelhar pagamento ${txid} (${normalizedKind}):`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.warn(`[supabase-sync] Exceção ao espelhar pagamento:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Espelha uma tarefa de áudio para a tabela `suno_tasks` no Supabase.
 */
export async function mirrorTaskToSupabase(taskId, taskData = {}, env = {}) {
  try {
    const supabase = getSupabaseEdge(env);
    if (!supabase) return { success: false, reason: 'not_configured' };

    const payload = {
      id: taskId,
      order_id: taskData.orderId || null,
      status: taskData.status || 'PENDING',
      provider: taskData.provider || null,
      clip_ids: Array.isArray(taskData.clipIds) ? taskData.clipIds : [],
      result: (taskData.result && typeof taskData.result === 'object') ? taskData.result : null,
      retry_task_id: taskData.retryTaskId || null,
      updated_at: toIso(taskData.updatedAt) || new Date().toISOString()
    };

    const { error } = await supabase
      .from('suno_tasks')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn(`[supabase-sync] Erro ao espelhar task ${taskId}:`, error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.warn(`[supabase-sync] Exceção ao espelhar task ${taskId}:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Mapeia uma linha da tabela suno_tasks do Supabase de volta para o formato Firestore
 */
export function mapSupabaseTaskToFirestore(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    orderId: row.order_id || null,
    status: row.status,
    provider: row.provider || null,
    clipIds: Array.isArray(row.clip_ids) ? row.clip_ids : [],
    result: row.result || null,
    retryTaskId: row.retry_task_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

