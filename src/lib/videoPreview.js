import { DOMINIO_CANONICO } from './siteUrl.js';
import { getOrder, updateOrder } from './supabaseDb.js';

/**
 * Normaliza a URL da VPS de vídeo substituindo IP ou porta legada
 * para o domínio oficial HTTPS com certificado SSL válido.
 */
export function normalizeVpsVideoUrl(rawUrl) {
  let clean = String(rawUrl || '').trim().replace(/\/+$/, '');
  if (!clean) return 'https://evolution.nsnexus.com.br/video';
  if (clean.includes(':3100')) {
    clean = clean.replace(':3100', '/video');
  }
  if (clean.includes('81.17.98.66')) {
    clean = clean.replace(/https?:\/\/81\.17\.98\.66(\/video)?/, 'https://evolution.nsnexus.com.br/video');
  }
  return clean;
}

/**
 * Constrói a URL pública de streaming do vídeo no próprio domínio canonical (nsmusic.nsnexus.com.br).
 * Esta URL é aberta, suporta streaming por Range (206 Partial Content), CORS global (*) e
 * não sofre com restrições de bots do Cloudflare ou URLs temporárias.
 */
export function buildPublicPreviewVideoUrl(orderId) {
  const cleanId = String(orderId || '').trim();
  if (!cleanId) return '';
  return `${DOMINIO_CANONICO}/api/video/stream/preview_${cleanId}.mp4`;
}

/**
 * Dispara ou aguarda a renderização da prévia de vídeo (60s SD leve) na VPS.
 * Se a VPS responder com sucesso, salva `previewVideoUrl` no pedido.
 * Se falhar ou expirar o tempo limite, retorna null sem interromper o fluxo do sistema.
 */
export async function triggerPreviewVideoRender(orderId, orderData = null, env = {}) {
  if (!orderId) return { ok: false, error: 'order_id_required' };

  try {
    const vpsVideoUrl = String(env?.VPS_VIDEO_URL || process.env.VPS_VIDEO_URL || 'https://evolution.nsnexus.com.br/video').trim();
    const vpsSecret = String(env?.VPS_VIDEO_SECRET || process.env.VPS_VIDEO_SECRET || '').trim();

    const order = orderData || await getOrder(orderId, env);
    if (!order) return { ok: false, error: 'order_not_found' };

    // Se a prévia já foi gerada anteriormente, retorna a URL pública canônica
    const existingUrl = order.previewVideoUrl || order.preview_video_url || order.extras?.previewVideoUrl;
    if (existingUrl) {
      return { ok: true, previewUrl: existingUrl, publicStreamUrl: buildPublicPreviewVideoUrl(orderId) };
    }

    const audioUrl = order.audioUrl || order.audio_url || (Array.isArray(order.audioFiles) ? order.audioFiles[0] : '');
    const coverUrl = order.coverUrl || order.cover_url || (Array.isArray(order.slideshowImages) ? order.slideshowImages[0] : '');

    if (!audioUrl || !coverUrl) {
      return { ok: false, error: 'missing_audio_or_cover' };
    }

    const cleanBaseUrl = normalizeVpsVideoUrl(vpsVideoUrl);
    const targetEndpoint = cleanBaseUrl.endsWith('/render-preview')
      ? cleanBaseUrl
      : `${cleanBaseUrl}/render-preview`;

    const title = `Prévia - ${order.customerName || order.recipientName || orderId}`;

    const headers = { 'Content-Type': 'application/json' };
    if (vpsSecret) {
      headers['Authorization'] = `Bearer ${vpsSecret}`;
    }

    console.log(`[VideoPreview] Solicitando renderização da prévia para pedido ${orderId} na VPS...`);

    const vpsRes = await fetch(targetEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        orderId,
        coverUrl,
        audioUrl,
        duration: 60,
        sync: true,
        title,
      }),
      // Limite de 18 segundos para manter dentro do ciclo de vida da Cloudflare Pages Edge
      signal: AbortSignal.timeout(18000),
    });

    if (!vpsRes.ok) {
      const errText = await vpsRes.text().catch(() => '');
      console.warn(`[VideoPreview] VPS respondeu status ${vpsRes.status}: ${errText.slice(0, 120)}`);
      return { ok: false, error: `vps_error_${vpsRes.status}` };
    }

    const data = await vpsRes.json().catch(() => ({}));
    const previewUrl = data?.previewUrl;

    if (previewUrl) {
      try {
        const curExtras = (order.extras && typeof order.extras === 'object') ? order.extras : {};
        await updateOrder(orderId, {
          extras: {
            ...curExtras,
            previewVideoUrl: previewUrl,
            previewVideoStatus: 'CONCLUIDO',
          },
        }, env);
      } catch (e) {
        console.warn('[VideoPreview] Erro ao persistir previewVideoUrl no pedido:', e.message);
      }

      console.log(`[VideoPreview] ✅ Prévia gerada com sucesso para pedido ${orderId}: ${previewUrl}`);
      return {
        ok: true,
        previewUrl,
        publicStreamUrl: buildPublicPreviewVideoUrl(orderId),
      };
    }

    return { ok: false, error: 'no_preview_url_returned' };
  } catch (err) {
    console.warn(`[VideoPreview] Falha ao gerar vídeo de prévia para ${orderId}:`, err?.message);
    return { ok: false, error: err?.message };
  }
}

/**
 * Obtém ou gera a URL pública de vídeo para um pedido
 */
export async function getOrderPreviewVideoUrl(orderId, orderData = null, env = {}) {
  if (!orderId) return null;
  const order = orderData || await getOrder(orderId, env);
  if (!order) return null;

  const existingUrl = order.previewVideoUrl || order.preview_video_url || order.extras?.previewVideoUrl;
  if (existingUrl) {
    return buildPublicPreviewVideoUrl(orderId);
  }

  const renderResult = await triggerPreviewVideoRender(orderId, order, env);
  if (renderResult.ok) {
    return renderResult.publicStreamUrl || buildPublicPreviewVideoUrl(orderId);
  }

  return null;
}
