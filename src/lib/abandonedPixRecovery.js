import { getSupabaseEdge } from './supabase-edge.js';
import { updateOrder } from './supabaseDb.js';
import { lerConfigSite, normalizarNumeroWhatsapp, WHATSAPP_SUPORTE_PADRAO } from './configSite.js';
import { enviarRecuperacaoCarrinhoCloud } from './whatsappCloudApi.js';
import { formatToWhatsAppNumber } from './whatsappTemplates.js';
import { resolverSiteUrl } from './siteUrl.js';
import { hasOrderGeneratedPix } from './pixCheckout.js';
import { getPhoneMatchKey, arePhonesMatching } from './trafficSource.js';

/**
 * Verifica se um pedido já foi pago ou possui recursos pagos concedidos.
 */
export function isOrderPaid(order) {
  if (!order) return false;
  const status = String(order.payment_status || order.paymentStatus || '').toUpperCase();
  if (status === 'PAGO' || status === 'PAGAMENTO_APROVADO') return true;
  if (order.paid_at || order.paidAt) return true;
  if (order.has_video_access || order.hasVideoAccess) return true;
  if (order.has_playback_access || order.hasPlaybackAccess) return true;
  if (order.has_carta_access || order.hasCartaAccess) return true;
  if (order.has_karaoke_access || order.hasKaraokeAccess) return true;
  return false;
}

/**
 * Regra estrita de exclusão:
 * Verifica se o cliente (por telefone ou e-mail) já realizou QUALQUER compra na plataforma.
 * Se o cliente possui 2 pedidos e pagou 1 deles, ele NUNCA deve receber mensagem de recuperação.
 * Apenas clientes que nunca compraram nada são elegíveis.
 */
export async function hasCustomerPriorPurchase(customerPhone, customerEmail, supabase) {
  if (!supabase) return false;

  const cleanEmail = String(customerEmail || '').trim().toLowerCase();
  const digits = String(customerPhone || '').replace(/\D/g, '');

  // 1. Checagem por E-mail
  if (cleanEmail && cleanEmail.includes('@')) {
    const { data: emailOrders } = await supabase
      .from('orders')
      .select('id, payment_status, paid_at, has_video_access, has_playback_access, has_carta_access, has_karaoke_access')
      .ilike('customer_email', cleanEmail)
      .limit(30);

    if (emailOrders && emailOrders.some(isOrderPaid)) {
      return true;
    }
  }

  // 2. Checagem por Telefone
  if (digits.length >= 8) {
    const last8 = digits.slice(-8);
    const { data: phoneOrders } = await supabase
      .from('orders')
      .select('id, customer_phone, payment_status, paid_at, has_video_access, has_playback_access, has_carta_access, has_karaoke_access')
      .ilike('customer_phone', `%${last8}%`)
      .limit(50);

    if (phoneOrders && phoneOrders.some((o) => arePhonesMatching(customerPhone, o.customer_phone) && isOrderPaid(o))) {
      return true;
    }
  }

  return false;
}

/**
 * Verifica se o cliente demonstrou intenção real de pagamento (clicou no botão de pagar / gerou PIX).
 */
export function hasClickedToPay(order) {
  if (!order) return false;
  if (hasOrderGeneratedPix(order)) return true;

  const extras = order.extras || {};
  if (extras.pixCopiedAt || extras.pixCopiedLastAt || extras.pixGeneratedAt || extras.pixRequestedAt) return true;
  if (extras.paymentIntentId || extras.pixTxid || extras.txid) return true;
  if (order.paymentIntentId || order.pixCopiedAt || order.pixTxid || order.txid) return true;

  return false;
}

/**
 * Executa o motor de recuperação de PIX abandonado da Meta Cloud API.
 * Roda a cada hora (via Cron ou acionamento manual do admin).
 *
 * @param {{ env?: object, maxBatch?: number, force?: boolean }} options
 * @returns {Promise<object>}
 */
export async function runAbandonedPixRecovery({ env = {}, maxBatch = 15, force = false } = {}) {
  const cfgSite = await lerConfigSite(env).catch(() => ({}));
  const isEnabled = cfgSite?.abandonedPixRecoveryEnabled === true;

  if (!force && !isEnabled) {
    return {
      success: true,
      enabled: false,
      message: 'Recuperação automática de PIX abandonado desativada nas configurações do painel admin.',
      processed: 0,
      sentCount: 0,
    };
  }

  const supabase = getSupabaseEdge(env);
  if (!supabase) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  const batchLimit = Math.max(1, Math.min(50, Number(cfgSite?.abandonedPixRecoveryMaxPerHour) || maxBatch || 15));
  const baseUrl = resolverSiteUrl(env?.NEXT_PUBLIC_SITE_URL);
  const numSuporte = normalizarNumeroWhatsapp(cfgSite?.whatsappSuporte) || WHATSAPP_SUPORTE_PADRAO;
  const linkSuporte = `https://wa.me/${numSuporte}`;

  // Janela de busca: pedidos criados entre 1 hora atrás e 24 horas atrás
  const agora = Date.now();
  const minCreatedAt = new Date(agora - 24 * 60 * 60 * 1000).toISOString();
  const maxCreatedAt = new Date(agora - 60 * 60 * 1000).toISOString();

  // Consulta pedidos não pagos dentro da janela de 24 horas
  const { data: candidates, error: queryErr } = await supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_phone, customer_email, honoree_name, payment_status, paid_at, suno_requested_at, created_at, extras')
    .in('payment_status', ['AGUARDANDO_PAGAMENTO', 'PENDENTE'])
    .gte('created_at', minCreatedAt)
    .lte('created_at', maxCreatedAt)
    .order('created_at', { ascending: false })
    .limit(100);

  if (queryErr) {
    console.error('[abandonedPixRecovery] Erro ao buscar pedidos candidatos:', queryErr.message);
    return { success: false, error: queryErr.message };
  }

  if (!candidates || candidates.length === 0) {
    return {
      success: true,
      enabled: true,
      message: 'Nenhum pedido pendente encontrado na janela de 1h a 24h.',
      candidatesFound: 0,
      sentCount: 0,
      processed: 0,
    };
  }

  // 1. Filtra apenas pedidos que realmente clicaram em pagar / geraram PIX
  // 2. Filtra pedidos que já receberam a mensagem de recuperação
  // 3. Filtra números válidos para WhatsApp
  const elegiveisBrutos = candidates.filter((c) => {
    if (c.extras?.abandoned_pix_recovery_sent || c.abandoned_pix_recovery_sent) return false;
    if (!hasClickedToPay(c)) return false;
    const phoneValid = formatToWhatsAppNumber(c.customer_phone);
    if (!phoneValid) return false;
    return true;
  });

  if (elegiveisBrutos.length === 0) {
    return {
      success: true,
      enabled: true,
      message: 'Nenhum pedido novo com intenção de PIX pendente de recuperação.',
      candidatesFound: candidates.length,
      sentCount: 0,
      processed: 0,
    };
  }

  // 4. Deduplica por cliente (se gerou 2 pedidos pendentes, manda só pro mais recente)
  const clientMap = new Map();
  for (const item of elegiveisBrutos) {
    const key = getPhoneMatchKey(item.customer_phone) || String(item.customer_email || '').toLowerCase().trim();
    if (!key) continue;
    if (!clientMap.has(key)) {
      clientMap.set(key, item);
    }
  }

  const leadsUnicos = Array.from(clientMap.values());
  const finalQueue = [];
  const excludedPriorPurchases = [];

  // 5. REGRA ESTRITA: Exclui qualquer cliente que já comprou na plataforma antes
  for (const lead of leadsUnicos) {
    const hasBought = await hasCustomerPriorPurchase(lead.customer_phone, lead.customer_email, supabase);
    if (hasBought) {
      excludedPriorPurchases.push(lead.order_number || lead.id);
      // Marca no pedido para não reavaliar desnecessariamente no futuro
      await updateOrder(lead.id, {
        abandoned_pix_recovery_skipped: 'has_prior_purchase',
        abandoned_pix_recovery_skipped_at: new Date().toISOString()
      }, env).catch(() => {});
    } else {
      finalQueue.push(lead);
    }

    if (finalQueue.length >= batchLimit) {
      break;
    }
  }

  const results = [];
  let sentCount = 0;
  let failedCount = 0;

  // 6. Envio das mensagens via Meta Cloud API Oficial com limite de lote
  for (const order of finalQueue) {
    const primeiroNome = String(order.customer_name || 'Cliente').trim().split(/\s+/)[0] || 'Cliente';
    const homenageado = String(order.honoree_name || 'alguém especial').trim();
    const linkPedido = `${baseUrl}/entrega?orderId=${encodeURIComponent(order.order_number || order.id)}`;

    try {
      const dispatch = await enviarRecuperacaoCarrinhoCloud(
        order.customer_phone,
        {
          cliente: primeiroNome,
          homenageado,
          link: linkPedido,
          linkSuporte,
        },
        env
      );

      if (dispatch.success) {
        sentCount++;
        await updateOrder(order.id, {
          abandoned_pix_recovery_sent: true,
          abandoned_pix_recovery_sent_at: new Date().toISOString(),
          abandoned_pix_recovery_phone: dispatch.phoneUsed || order.customer_phone,
          abandoned_pix_recovery_provider: 'cloud_api'
        }, env);

        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          phone: order.customer_phone,
          status: 'SENT',
        });
      } else {
        failedCount++;
        results.push({
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          phone: order.customer_phone,
          status: 'FAILED',
          error: dispatch.error || 'Erro desconhecido na Meta Cloud API',
        });
      }

      // Pequeno intervalo entre envios para suavizar taxa de mensagens
      await new Promise((resolve) => setTimeout(resolve, 800));
    } catch (sendErr) {
      failedCount++;
      results.push({
        orderId: order.id,
        orderNumber: order.order_number,
        customerName: order.customer_name,
        phone: order.customer_phone,
        status: 'ERROR',
        error: sendErr.message,
      });
    }
  }

  return {
    success: true,
    enabled: isEnabled,
    candidatesFound: candidates.length,
    eligibleLeads: leadsUnicos.length,
    excludedPriorPurchasesCount: excludedPriorPurchases.length,
    processedCount: finalQueue.length,
    sentCount,
    failedCount,
    results,
  };
}

/**
 * Coleta métricas de recuperação de PIX abandonado para o painel administrativo.
 *
 * @param {{ env?: object }} options
 * @returns {Promise<object>}
 */
export async function getAbandonedPixRecoveryMetrics({ env = {} } = {}) {
  const supabase = getSupabaseEdge(env);
  const cfgSite = await lerConfigSite(env).catch(() => ({}));

  if (!supabase) {
    return {
      enabled: cfgSite?.abandonedPixRecoveryEnabled === true,
      maxPerHour: Number(cfgSite?.abandonedPixRecoveryMaxPerHour) || 15,
      whatsappSuporte: cfgSite?.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
      totalSent: 0,
      totalRecovered: 0,
      conversionRate: 0,
      recoveredRevenue: 0,
      recentRecovered: [],
      recentSent: [],
    };
  }

  // 1. Busca todos os pedidos que receberam a mensagem de recuperação
  const { data: sentOrders, error } = await supabase
    .from('orders')
    .select('id, order_number, customer_name, customer_phone, customer_email, honoree_name, payment_status, paid_at, created_at, extras')
    .filter('extras->>abandoned_pix_recovery_sent', 'eq', 'true')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    console.warn('[abandonedPixRecovery] Erro ao buscar métricas:', error.message);
  }

  const allSent = sentOrders || [];
  const totalSent = allSent.length;

  // 2. Filtra pedidos que converteram em compra após receber a mensagem
  const recoveredList = allSent.filter((o) => {
    const isPaid = isOrderPaid(o);
    const markedRecovered = Boolean(o.extras?.recovered_via_abandoned_pix);
    return isPaid || markedRecovered;
  });

  const totalRecovered = recoveredList.length;
  const conversionRate = totalSent > 0 ? (totalRecovered / totalSent) * 100 : 0;

  // 3. Calcula receita recuperada
  const recoveredRevenue = recoveredList.reduce((acc, curr) => {
    const val = Number(curr.extras?.recovered_via_abandoned_pix_amount) ||
      Number(curr.extras?.paid_amount) ||
      Number(curr.extras?.paidAmount) ||
      Number(curr.extras?.amount) ||
      9.99;
    return acc + val;
  }, 0);

  // 4. Formata listas para exibição no painel
  const recentRecovered = recoveredList.slice(0, 20).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name || 'Cliente',
    customerPhone: o.customer_phone || '',
    honoreeName: o.honoree_name || '',
    sentAt: o.extras?.abandoned_pix_recovery_sent_at || o.created_at,
    paidAt: o.paid_at || o.extras?.recovered_via_abandoned_pix_at || null,
    amount: Number(o.extras?.recovered_via_abandoned_pix_amount || 9.99),
  }));

  const recentSent = allSent.slice(0, 25).map((o) => ({
    id: o.id,
    orderNumber: o.order_number,
    customerName: o.customer_name || 'Cliente',
    customerPhone: o.customer_phone || '',
    honoreeName: o.honoree_name || '',
    sentAt: o.extras?.abandoned_pix_recovery_sent_at || o.created_at,
    isConverted: isOrderPaid(o) || Boolean(o.extras?.recovered_via_abandoned_pix),
    status: o.payment_status || 'AGUARDANDO_PAGAMENTO',
  }));

  return {
    enabled: cfgSite?.abandonedPixRecoveryEnabled === true,
    maxPerHour: Number(cfgSite?.abandonedPixRecoveryMaxPerHour) || 15,
    whatsappSuporte: cfgSite?.whatsappSuporte || WHATSAPP_SUPORTE_PADRAO,
    totalSent,
    totalRecovered,
    conversionRate: Math.round(conversionRate * 10) / 10,
    recoveredRevenue: Math.round(recoveredRevenue * 100) / 100,
    recentRecovered,
    recentSent,
  };
}

