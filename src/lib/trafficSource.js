// Rastreamento e atribuição de plataforma de tráfego/conversão
// Suporta: Facebook & Instagram Ads (Meta), TikTok Ads, Google Ads, Orgânico e Direto.
// Compatível com Cloudflare Pages Edge e Next.js App Router.

import { getPriceForSku, SKU_PRICES } from '@/lib/pricing.js';

export const TRAFFIC_STORAGE_KEY = 'nsmusic_traffic_source';

export const PLATFORMS = {
  facebook_ads: {
    key: 'facebook_ads',
    name: 'Facebook & Instagram Ads',
    shortName: 'Meta Ads',
    color: '#1877F2',
    bgLight: '#eff6ff',
    borderColor: '#bfdbfe',
    badgeBg: '#1877F2',
    icon: '📘',
  },
  tiktok_ads: {
    key: 'tiktok_ads',
    name: 'TikTok Ads',
    shortName: 'TikTok Ads',
    color: '#fe2c55',
    bgLight: '#fff1f2',
    borderColor: '#fecdd3',
    badgeBg: '#0f172a',
    icon: '🎵',
  },
  google_ads: {
    key: 'google_ads',
    name: 'Google Ads',
    shortName: 'Google Ads',
    color: '#ea4335',
    bgLight: '#fef2f2',
    borderColor: '#fecaca',
    badgeBg: '#ea4335',
    icon: '🔍',
  },
  organico: {
    key: 'organico',
    name: 'Orgânico (Busca & Redes)',
    shortName: 'Orgânico',
    color: '#059669',
    bgLight: '#ecfdf5',
    borderColor: '#a7f3d0',
    badgeBg: '#059669',
    icon: '🌱',
  },
  direto: {
    key: 'direto',
    name: 'Direto / Outros',
    shortName: 'Direto',
    color: '#64748b',
    bgLight: '#f8fafc',
    borderColor: '#e2e8f0',
    badgeBg: '#64748b',
    icon: '🔗',
  },
};

/**
 * Lê os parâmetros da URL atual e Referrer do navegador e identifica a plataforma.
 * Persiste no localStorage e sessionStorage para preservar a atribuição entre navegações internas.
 */
export function identifyTrafficSource() {
  if (typeof window === 'undefined') return { platform: 'direto' };

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const utmSource = (urlParams.get('utm_source') || '').trim();
    const utmMedium = (urlParams.get('utm_medium') || '').trim();
    const utmCampaign = (urlParams.get('utm_campaign') || '').trim();
    const utmContent = (urlParams.get('utm_content') || '').trim();
    const utmTerm = (urlParams.get('utm_term') || '').trim();
    const fbclid = (urlParams.get('fbclid') || '').trim();
    const ttclid = (urlParams.get('ttclid') || '').trim();
    const gclid = (urlParams.get('gclid') || '').trim();
    const referrer = typeof document !== 'undefined' ? (document.referrer || '') : '';

    const hasNewTrackingParams = Boolean(
      utmSource || utmMedium || utmCampaign || fbclid || ttclid || gclid
    );

    // Recupera dados salvos anteriormente (se houver)
    let existing = null;
    try {
      const raw = localStorage.getItem(TRAFFIC_STORAGE_KEY) || sessionStorage.getItem(TRAFFIC_STORAGE_KEY);
      if (raw) existing = JSON.parse(raw);
    } catch (e) {}

    // Se o visitante está navegando sem novos parâmetros de anúncio na URL, mantém a atribuição original da sessão
    if (!hasNewTrackingParams && existing && existing.platform) {
      return existing;
    }

    // Regras de detecção de plataforma
    let platform = 'direto';
    const srcLower = utmSource.toLowerCase();
    const medLower = utmMedium.toLowerCase();
    const refLower = referrer.toLowerCase();

    // 1. TikTok Ads
    if (ttclid || /tiktok|bytedance|tt_/i.test(srcLower) || /tiktok/i.test(medLower)) {
      platform = 'tiktok_ads';
    }
    // 2. Facebook & Instagram Ads (Meta)
    else if (
      fbclid ||
      /facebook|meta|fb|instagram|ig_/i.test(srcLower) ||
      ((medLower.includes('cpc') || medLower.includes('ads') || medLower.includes('paid')) &&
        (refLower.includes('facebook') || refLower.includes('instagram')))
    ) {
      platform = 'facebook_ads';
    }
    // 3. Google Ads
    else if (gclid || (/google|adwords/i.test(srcLower) && /cpc|ads|paid/i.test(medLower))) {
      platform = 'google_ads';
    }
    // 4. Busca Orgânica (Google, Bing, Yahoo, DuckDuckGo, Ecosia)
    else if (
      /google\.|bing\.|yahoo\.|duckduckgo\.|ecosia\./i.test(refLower) ||
      /organic|organico/i.test(medLower) ||
      /organico/i.test(srcLower)
    ) {
      platform = 'organico';
    }
    // 5. Social Orgânico (links vindos de redes sociais sem parâmetros de anúncios pagos)
    else if (
      /instagram\.com|facebook\.com|l\.instagram\.com|l\.facebook\.com|tiktok\.com|t\.co|twitter\.com|x\.com|whatsapp/i.test(refLower)
    ) {
      platform = 'organico';
    }
    // 6. Tráfego direto vs. Referência externa
    else if (!referrer || referrer.includes(window.location.hostname)) {
      platform = existing?.platform || 'direto';
    } else {
      platform = 'organico';
    }

    const trafficData = {
      platform,
      trafficSource: platform,
      utmSource: utmSource || (existing?.utmSource || null),
      utmMedium: utmMedium || (existing?.utmMedium || null),
      utmCampaign: utmCampaign || (existing?.utmCampaign || null),
      utmContent: utmContent || (existing?.utmContent || null),
      utmTerm: utmTerm || (existing?.utmTerm || null),
      fbclid: fbclid || (existing?.fbclid || null),
      ttclid: ttclid || (existing?.ttclid || null),
      gclid: gclid || (existing?.gclid || null),
      referrer: referrer || (existing?.referrer || null),
      capturedAt: new Date().toISOString(),
    };

    try {
      const serialized = JSON.stringify(trafficData);
      localStorage.setItem(TRAFFIC_STORAGE_KEY, serialized);
      sessionStorage.setItem(TRAFFIC_STORAGE_KEY, serialized);
    } catch (e) {}

    return trafficData;
  } catch (err) {
    console.warn('[trafficSource] Erro ao identificar origem do tráfego:', err?.message);
    return { platform: 'direto', trafficSource: 'direto' };
  }
}

/**
 * Retorna os dados de tráfego salvos na sessão/localStorage.
 */
export function getStoredTrafficSource() {
  if (typeof window === 'undefined') return { platform: 'direto', trafficSource: 'direto' };
  try {
    const raw = localStorage.getItem(TRAFFIC_STORAGE_KEY) || sessionStorage.getItem(TRAFFIC_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.platform) return parsed;
    }
  } catch (e) {}
  return identifyTrafficSource();
}

/**
 * Identifica a plataforma de um pedido específico.
 * Para pedidos anteriores (históricos) sem registro de trafficSource, atribui ao Facebook Ads
 * conforme diretriz do administrador ("os anteriores é tudo facebook ads").
 */
export function getOrderPlatform(order) {
  if (!order) return 'facebook_ads';

  // 1. Campo explícito gravado no pedido (novos pedidos após a implementação)
  const rawSource = order.trafficSource || order.platform;
  if (rawSource) {
    const s = String(rawSource).toLowerCase();
    if (s === 'tiktok_ads' || s === 'tiktok') return 'tiktok_ads';
    if (s === 'facebook_ads' || s === 'facebook' || s === 'meta_ads') return 'facebook_ads';
    if (s === 'google_ads' || s === 'google') return 'google_ads';
    if (s === 'organico' || s === 'organic') return 'organico';
    if (s === 'direto' || s === 'direct') return 'direto';
  }

  // 2. Se houver UTMs ou Click IDs gravados nos extras
  const utmSource = String(order.utmSource || '').toLowerCase();
  const utmMedium = String(order.utmMedium || '').toLowerCase();

  if (order.ttclid || /tiktok|bytedance|tt_/i.test(utmSource)) {
    return 'tiktok_ads';
  }
  if (order.fbclid || /facebook|meta|fb|instagram|ig_/i.test(utmSource)) {
    return 'facebook_ads';
  }
  if (order.gclid || /google|adwords/i.test(utmSource)) {
    return 'google_ads';
  }
  if (/organico|organic/i.test(utmSource) || /organico|organic/i.test(utmMedium)) {
    return 'organico';
  }
  if (/direto|direct/i.test(utmSource)) {
    return 'direto';
  }

  // 3. Pedidos anteriores à implementação:
  // Diretriz do administrador: todo o histórico anterior operava sob campanhas do Facebook Ads.
  return 'facebook_ads';
}

/**
 * Calcula o faturamento real pago de um pedido individual (música + add-ons avulsos).
 */
export function calcularFaturamentoPedido(o) {
  if (!o) return 0;
  let total = 0;

  const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
  if (musicaPaga) {
    if (o.paidAmount !== null && o.paidAmount !== undefined && o.paidAmount !== '') {
      const v = Number(o.paidAmount);
      if (Number.isFinite(v) && v > 0) {
        total += v;
      } else {
        total += 9.99;
      }
    } else {
      const porSku = getPriceForSku(o.paymentIntentSku);
      if (porSku !== null && o.paymentIntentSku !== 'impacto') {
        total += porSku;
      } else {
        total += 9.99;
      }
    }
  }

  // Add-ons comprados SEPARADAMENTE (com id de transação próprio para não duplicar combo)
  if (o.videoPaymentId && (o.hasVideoAccess || o.videoAddonPaid)) {
    const v = Number(o.videoPaidAmount);
    total += (Number.isFinite(v) && v > 0) ? v : 6.90;
  }
  if (o.cartaPaymentId && (o.hasCartaAccess || o.cartaAddonPaid)) {
    const v = Number(o.cartaPaidAmount);
    total += (Number.isFinite(v) && v > 0) ? v : (getPriceForSku('carta_addon') || 3.99);
  }
  if (o.retrospectivaPaymentId && (o.hasRetrospectivaAccess || o.retrospectivaAddonPaid)) {
    const v = Number(o.retrospectivaPaidAmount);
    total += (Number.isFinite(v) && v > 0) ? v : (getPriceForSku('retrospectiva_addon') || 9.99);
  }
  if (o.playbackPaymentId && (o.hasPlaybackAccess || o.playbackAddonPaid)) {
    const v = Number(o.playbackPaidAmount);
    total += (Number.isFinite(v) && v > 0) ? v : (getPriceForSku('playback_addon') || 4.99);
  }
  if (o.karaokePaymentId && (o.hasKaraokeAccess || o.karaokeAddonPaid)) {
    const v = Number(o.karaokePaidAmount);
    total += (Number.isFinite(v) && v > 0) ? v : (getPriceForSku('karaoke_addon') || 9.90);
  }

  return total;
}

/**
 * Agrupa pedidos por plataforma e calcula faturamento, conversões e ticket médio.
 */
export function calcularMetricasPorPlataforma(pedidos = []) {
  const metricas = {
    facebook_ads: { ...PLATFORMS.facebook_ads, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0 },
    tiktok_ads: { ...PLATFORMS.tiktok_ads, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0 },
    google_ads: { ...PLATFORMS.google_ads, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0 },
    organico: { ...PLATFORMS.organico, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0 },
    direto: { ...PLATFORMS.direto, pedidosCriados: 0, pedidosPagos: 0, faturamento: 0 },
  };

  let faturamentoTotalGeral = 0;
  let pedidosPagosTotalGeral = 0;
  let pedidosCriadosTotalGeral = 0;

  for (const o of pedidos) {
    const platKey = getOrderPlatform(o);
    const target = metricas[platKey] || metricas.direto;

    target.pedidosCriados += 1;
    pedidosCriadosTotalGeral += 1;

    const musicaPaga = o.paymentStatus === 'PAGAMENTO_APROVADO' || o.paymentStatus === 'PAGO';
    const teveVendaPaga = musicaPaga || o.videoAddonPaid || o.cartaAddonPaid || o.retrospectivaAddonPaid || o.playbackAddonPaid || o.karaokeAddonPaid;

    if (teveVendaPaga) {
      const valor = calcularFaturamentoPedido(o);
      target.pedidosPagos += 1;
      target.faturamento += valor;

      pedidosPagosTotalGeral += 1;
      faturamentoTotalGeral += valor;
    }
  }

  // Calcula taxas e tickets médios
  const plataformasArray = Object.values(metricas).map((m) => {
    const conversao = m.pedidosCriados > 0 ? (m.pedidosPagos / m.pedidosCriados) * 100 : 0;
    const ticketMedio = m.pedidosPagos > 0 ? m.faturamento / m.pedidosPagos : 0;
    const percFaturamento = faturamentoTotalGeral > 0 ? (m.faturamento / faturamentoTotalGeral) * 100 : 0;

    return {
      ...m,
      conversao: Math.round(conversao * 10) / 10,
      ticketMedio: Math.round(ticketMedio * 100) / 100,
      percFaturamento: Math.round(percFaturamento * 10) / 10,
    };
  });

  return {
    plataformas: plataformasArray,
    totais: {
      faturamento: faturamentoTotalGeral,
      pedidosPagos: pedidosPagosTotalGeral,
      pedidosCriados: pedidosCriadosTotalGeral,
      conversaoGeral: pedidosCriadosTotalGeral > 0 ? Math.round((pedidosPagosTotalGeral / pedidosCriadosTotalGeral) * 1000) / 10 : 0,
      ticketMedioGeral: pedidosPagosTotalGeral > 0 ? Math.round((faturamentoTotalGeral / pedidosPagosTotalGeral) * 100) / 100 : 0,
    },
  };
}
