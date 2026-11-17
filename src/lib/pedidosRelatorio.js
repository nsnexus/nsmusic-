// Busca de pedidos para os relatórios do painel (Dashboard, cards de faturamento, ritmo de vendas)
// e para o widget da tela inicial. Extraído de api/admin/reports para as duas pontas usarem a
// MESMA leitura — assim o widget mostra exatamente o que o Dashboard mostra.

// Projeção otimizada: seleciona apenas as colunas necessárias e o JSONB extras direto.
// Omite colunas pesadas como lyrics, story, suno_prompt, audio_files, slideshow_images
// que inflavam o payload, mantendo a consulta rápida e 100% compatível com PostgREST.
export const COLUNAS_PEDIDO_RELATORIO = [
  'id', 'order_number', 'customer_phone', 'payment_status', 'paid_at', 'created_at',
  'has_video_access', 'has_carta_access', 'has_playback_access', 'has_retrospectiva_access',
  'has_karaoke_access', 'suno_generation_count', 'suno_requested_at', 'suno_provider',
  'ready_template_sent', 'payment_whatsapp_sent', 'whatsapp_sent', 'extras',
  // Usadas por mapearPedido -> hasMusicaGerada. Sem elas, "Músicas Geradas" só contava
  // pedidos pagos ou com status/áudio duplicado no extras, subestimando gerações e conversão.
  'production_status', 'audio_url'
].join(',');

export const mapearPedidoRelatorio = (row) => {
  const isPago = row.payment_status === 'PAGO' || row.payment_status === 'PAGAMENTO_APROVADO';
  const extras = row.extras || {};
  const hasVid = Boolean(row.has_video_access || extras.videoAddonPaid);
  const hasCarta = Boolean(row.has_carta_access || extras.cartaAddonPaid);
  const hasPlay = Boolean(row.has_playback_access || extras.playbackAddonPaid);
  const hasRetro = Boolean(row.has_retrospectiva_access || extras.retrospectivaAddonPaid);
  const hasKara = Boolean(row.has_karaoke_access || extras.hasKaraokeAccess || extras.karaokeAddonPaid);

  return {
    id: row.id,
    orderNumber: row.order_number,
    customerPhone: row.customer_phone,
    paymentStatus: row.payment_status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    hasVideoAccess: hasVid,
    hasCartaAccess: hasCarta,
    hasPlaybackAccess: hasPlay,
    hasRetrospectivaAccess: hasRetro,
    hasKaraokeAccess: hasKara,
    sunoGenerationCount: row.suno_generation_count,
    sunoRequestedAt: row.suno_requested_at,
    sunoProvider: row.suno_provider || null,
    readyTemplateSent: Boolean(row.ready_template_sent ?? extras.readyTemplateSent),
    paymentWhatsappSent: Boolean(row.payment_whatsapp_sent ?? extras.paymentWhatsappSent),
    whatsappSent: Boolean(row.whatsapp_sent ?? extras.whatsappSent),
    videoAddonPaid: extras.videoAddonPaid ?? (hasVid && isPago),
    videoPaidAt: extras.videoPaidAt ?? row.paid_at,
    videoPaidAmount: extras.videoPaidAmount,
    videoPaymentId: extras.videoPaymentId,
    playbackAddonPaid: extras.playbackAddonPaid ?? (hasPlay && isPago),
    playbackPaidAt: extras.playbackPaidAt ?? row.paid_at,
    playbackPaidAmount: extras.playbackPaidAmount,
    playbackPaymentId: extras.playbackPaymentId,
    cartaAddonPaid: extras.cartaAddonPaid ?? (hasCarta && isPago),
    cartaPaidAt: extras.cartaPaidAt ?? row.paid_at,
    cartaPaidAmount: extras.cartaPaidAmount,
    cartaPaymentId: extras.cartaPaymentId,
    retrospectivaAddonPaid: extras.retrospectivaAddonPaid ?? (hasRetro && isPago),
    retrospectivaPaidAt: extras.retrospectivaPaidAt ?? row.paid_at,
    retrospectivaPaidAmount: extras.retrospectivaPaidAmount,
    retrospectivaPaymentId: extras.retrospectivaPaymentId,
    karaokeAddonPaid: extras.karaokeAddonPaid ?? (hasKara && isPago),
    karaokePaidAt: extras.karaokePaidAt ?? row.paid_at,
    karaokePaidAmount: extras.karaokePaidAmount,
    karaokePaymentId: extras.karaokePaymentId,
    paidAmount: extras.paidAmount ?? null,
    paymentIntentSku: extras.paymentIntentSku ?? null,
    isSecondGeneration: Boolean(extras.isSecondGeneration),
    origem: extras.origem ?? null,
    paidSku: extras.paidSku ?? null,
    parentOrderId: extras.parentOrderId ?? null,
    trafficSource: extras.trafficSource ?? null,
    platform: extras.platform ?? null,
    utmSource: extras.utmSource ?? null,
    utmMedium: extras.utmMedium ?? null,
    utmCampaign: extras.utmCampaign ?? null,
    utmContent: extras.utmContent ?? null,
    utmTerm: extras.utmTerm ?? null,
    fbclid: extras.fbclid ?? null,
    ttclid: extras.ttclid ?? null,
    gclid: extras.gclid ?? null,
    referrer: extras.referrer ?? null,
    userAgent: extras.userAgent ?? null,
    productionStatus: row.production_status || extras.productionStatus || null,
    audioUrl: row.audio_url || extras.audioUrl || null,
    hasAudio: Boolean(row.audio_url || extras.audioUrl),
    extras: {
      trafficSource: extras.trafficSource,
      platform: extras.platform,
      paidAmount: extras.paidAmount,
      paymentIntentSku: extras.paymentIntentSku,
      isSecondGeneration: extras.isSecondGeneration,
      origem: extras.origem,
      paidSku: extras.paidSku,
      parentOrderId: extras.parentOrderId,
      utmSource: extras.utmSource,
      utmMedium: extras.utmMedium,
      utmCampaign: extras.utmCampaign,
      fbclid: extras.fbclid,
      ttclid: extras.ttclid,
      gclid: extras.gclid,
    }
  };
};


// Campos do `extras` que os relatórios usam (mapearPedidoRelatorio e pedidos_recentes). As consultas
// pedem SÓ esses campos ao banco (`x_campo:extras->campo`) em vez do JSON inteiro do pedido, que
// carrega letra, história, faixas etc. e deixava o Dashboard pesado demais para carregar.
export const CAMPOS_EXTRAS_RELATORIO = [
  'audioUrl', 'cartaAddonPaid', 'cartaPaidAmount', 'cartaPaidAt', 'cartaPaymentId', 'fbclid', 'gclid',
  'hasKaraokeAccess', 'isSecondGeneration', 'karaokeAddonPaid', 'karaokePaidAmount', 'karaokePaidAt',
  'karaokePaymentId', 'origem', 'paidAmount', 'paidSku', 'parentOrderId', 'paymentIntentSku',
  'paymentWhatsappSent', 'platform', 'playbackAddonPaid', 'playbackPaidAmount', 'playbackPaidAt',
  'playbackPaymentId', 'productionStatus', 'readyTemplateSent', 'referrer', 'retrospectivaAddonPaid',
  'retrospectivaPaidAmount', 'retrospectivaPaidAt', 'retrospectivaPaymentId', 'trafficSource', 'ttclid',
  'userAgent', 'utmCampaign', 'utmContent', 'utmMedium', 'utmSource', 'utmTerm', 'videoAddonPaid',
  'videoPaidAmount', 'videoPaidAt', 'videoPaymentId', 'whatsappSent',
];
const SELECAO_EXTRAS = CAMPOS_EXTRAS_RELATORIO.map((k) => `x_${k}:extras->${k}`).join(',');

/** Colunas sem o `extras` inteiro, com só os campos usados (ver CAMPOS_EXTRAS_RELATORIO). */
export function colunasLeves(colunas) {
  return `${colunas.split(',').map((c) => c.trim()).filter((c) => c && c !== 'extras').join(',')},${SELECAO_EXTRAS}`;
}
export const COLUNAS_LEVES_RELATORIO = colunasLeves(COLUNAS_PEDIDO_RELATORIO);

/** Remonta row.extras a partir dos campos x_* da consulta leve. */
export function remontarExtras(row) {
  // Se a linha veio com o extras inteiro (consulta antiga, testes), mantém e completa com os x_*.
  const extras = (row.extras && typeof row.extras === 'object') ? { ...row.extras } : {};
  for (const k of CAMPOS_EXTRAS_RELATORIO) {
    const v = row[`x_${k}`];
    if (v !== undefined && v !== null) extras[k] = v;
  }
  return { ...row, extras };
}

/** Pedidos criados no intervalo [inicio, fim) — mesma projeção do relatório pedidos_mes. */
export async function buscarPedidosDoPeriodo(supabase, inicio, fim) {
  let todosPedidos = [];
  let lastCreatedAt = null;
  const pageSize = 1000;

  while (true) {
    let q = supabase
      .from('orders')
      .select(COLUNAS_LEVES_RELATORIO);

    if (lastCreatedAt) {
      q = q.gt('created_at', lastCreatedAt);
    } else {
      q = q.gte('created_at', inicio);
    }

    q = q
      .lt('created_at', fim)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(pageSize);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    todosPedidos = todosPedidos.concat(data.map((row) => mapearPedidoRelatorio(remontarExtras(row))));
    if (data.length < pageSize) break;
    lastCreatedAt = data[data.length - 1].created_at;
  }

  return todosPedidos;
}

/** Pedidos criados ou pagos nos últimos `dias` dias — mesma projeção do relatório pedidos_recentes. */
export async function buscarPedidosRecentes(supabase, dias = 8) {
  const agora = new Date();
  const inicioData = new Date(agora.getTime() - dias * 24 * 60 * 60 * 1000);
  inicioData.setUTCHours(0, 0, 0, 0);
  const inicio = inicioData.toISOString();

  const todosPedidos = [];
  let pageOffset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select(colunasLeves('id, order_number, customer_phone, payment_status, paid_at, created_at, production_status, audio_url, has_video_access, has_carta_access, has_playback_access, has_retrospectiva_access, has_karaoke_access, suno_generation_count, suno_requested_at, extras'))
      .or(`created_at.gte.${inicio},paid_at.gte.${inicio}`)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(pageSize)
      .offset(pageOffset);

    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const extras = remontarExtras(row).extras;
      todosPedidos.push({
        id: row.id,
        orderNumber: row.order_number,
        customerPhone: row.customer_phone,
        paymentStatus: row.payment_status,
        productionStatus: row.production_status,
        audioUrl: row.audio_url,
        paidAt: row.paid_at,
        createdAt: row.created_at,
        hasVideoAccess: row.has_video_access,
        hasCartaAccess: row.has_carta_access,
        hasPlaybackAccess: row.has_playback_access,
        hasRetrospectivaAccess: row.has_retrospectiva_access,
        hasKaraokeAccess: row.has_karaoke_access,
        sunoGenerationCount: row.suno_generation_count,
        sunoRequestedAt: row.suno_requested_at,
        videoAddonPaid: extras.videoAddonPaid ?? (row.has_video_access && row.payment_status === 'PAGO'),
        videoPaidAt: extras.videoPaidAt ?? row.paid_at,
        videoPaidAmount: extras.videoPaidAmount,
        videoPaymentId: extras.videoPaymentId,
        playbackAddonPaid: extras.playbackAddonPaid ?? (row.has_playback_access && row.payment_status === 'PAGO'),
        playbackPaidAt: extras.playbackPaidAt ?? row.paid_at,
        playbackPaidAmount: extras.playbackPaidAmount,
        playbackPaymentId: extras.playbackPaymentId,
        cartaAddonPaid: extras.cartaAddonPaid ?? (row.has_carta_access && row.payment_status === 'PAGO'),
        cartaPaidAt: extras.cartaPaidAt ?? row.paid_at,
        cartaPaidAmount: extras.cartaPaidAmount,
        cartaPaymentId: extras.cartaPaymentId,
        retrospectivaAddonPaid: extras.retrospectivaAddonPaid ?? (row.has_retrospectiva_access && row.payment_status === 'PAGO'),
        retrospectivaPaidAt: extras.retrospectivaPaidAt ?? row.paid_at,
        retrospectivaPaidAmount: extras.retrospectivaPaidAmount,
        retrospectivaPaymentId: extras.retrospectivaPaymentId,
        paidAmount: extras.paidAmount ?? null,
        paymentIntentSku: extras.paymentIntentSku ?? null,
        isSecondGeneration: Boolean(extras.isSecondGeneration),
        origem: extras.origem ?? null,
        paidSku: extras.paidSku ?? null,
        parentOrderId: extras.parentOrderId ?? null,
      });
    }

    if (data.length < pageSize) break;
    pageOffset += pageSize;
  }

  return todosPedidos;
}
