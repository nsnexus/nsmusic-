// Bônus automático da 2ª geração por telefone (17/11/2026).
//
// Quem paga uma música ganha uma 2ª geração grátis (ver payments.js: segundaGeracaoDisponivel). Muitos
// clientes não usam o link do bônus: abrem /criar de novo, criam um pedido novo e ficam sem conseguir
// gerar, enquanto o bônus fica "perdido" no pedido pago. Aqui, sempre que um pedido novo NÃO pago
// tem o telefone de um cliente com bônus sobrando, o pedido vira a 2ª geração do pedido pago — mesmo
// formato do bônus via link (orders/create), e o consumo continua sendo marcado só quando a música é
// de fato gerada (db.js:updateTaskResult).

import { getSupabaseEdge } from './supabase-edge.js';
import { mapSupabaseOrderToFirestore } from './supabaseSync.js';
import { generatePhoneVariants } from './orderLookup.js';

const STATUS_PAGO = ['PAGO', 'PAGAMENTO_APROVADO'];

export function pedidoEhPago(order) {
  return Boolean(order && STATUS_PAGO.includes(order.paymentStatus));
}

export function pedidoEhBonus(order) {
  if (!order) return false;
  const ex = order.extras || {};
  return Boolean(
    order.isSecondGeneration || ex.isSecondGeneration ||
    order.paidSku === 'segunda_geracao_bonus' ||
    order.origem === 'segunda_geracao' || order.origem === 'segunda_musica' ||
    order.parentOrderId || ex.parentOrderId
  );
}

/** Id do pedido que já está vinculado como bônus deste pedido pago (se houver). */
export function bonusVinculadoId(parent) {
  const ex = parent?.extras || {};
  return parent?.segundaGeracaoOrderId || ex.segundaGeracaoOrderId ||
    parent?.secondGenerationOrderId || ex.secondGenerationOrderId || null;
}

/** O pedido vinculado já gerou (ou está gerando) música? Se sim, o bônus está ocupado. */
export function pedidoJaGerou(order) {
  if (!order || order.deletedAt) return false;
  return Boolean(order.audioUrl || order.sunoTaskId || (Array.isArray(order.audioFiles) && order.audioFiles.length > 0));
}

/**
 * Regra pura: este pedido pago ainda tem a 2ª geração disponível para `orderIdAtual`?
 * `pedidoVinculado` é o pedido já ligado ao bônus (se houver), carregado pelo chamador.
 */
export function bonusDisponivel(parent, { orderIdAtual = null, pedidoVinculado = null } = {}) {
  if (!pedidoEhPago(parent) || pedidoEhBonus(parent)) return false;
  const ex = parent.extras || {};
  if (parent.segundaGeracaoUsada || ex.segundaGeracaoUsada) return false;
  if (parent.segundaGeracaoDisponivel === false || ex.segundaGeracaoDisponivel === false) return false;

  const vinculado = bonusVinculadoId(parent);
  if (!vinculado || vinculado === orderIdAtual) return true;
  // Já existe outro pedido ligado ao bônus. Ele só "segura" o bônus se chegou a gerar música;
  // pedido abandonado antes de gerar libera o bônus para o pedido novo.
  return !pedidoJaGerou(pedidoVinculado);
}

/**
 * Dia (AAAA-MM-DD) no horário de Brasília. O Brasil não tem horário de verão desde 2019, então
 * UTC-3 fixo dá o mesmo resultado sem depender de fuso no runtime.
 */
export function diaEmBrasilia(data) {
  const ms = new Date(data).getTime();
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * O pedido pago foi pago HOJE (horário de Brasília)? Regra do dono (20/11/2026): o vínculo automático
 * pelo telefone só vale no mesmo dia. Se o cliente volta outro dia e cria uma música pela plataforma,
 * é um pedido novo e independente (pago à parte); o bônus continua no pedido antigo, pelo link dele.
 */
export function pagoNoMesmoDia(parent, agora = new Date()) {
  const quando = parent?.paidAt || parent?.extras?.paidAt || parent?.createdAt;
  const dia = quando ? diaEmBrasilia(quando) : null;
  return Boolean(dia && dia === diaEmBrasilia(agora));
}

/**
 * Procura, pelo telefone, um pedido pago com a 2ª geração ainda disponível.
 * `somenteMesmoDia`: no vínculo AUTOMÁTICO, só aceita pedido pago hoje (ver pagoNoMesmoDia).
 */
export async function encontrarBonusDisponivel(phone, env = {}, { orderIdAtual = null, somenteMesmoDia = false, agora = new Date() } = {}) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return null;
  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  let pagos = [];
  try {
    // Busca só os pedidos PAGOS: o cliente que cria vários pedidos novos não empurra o pago para fora.
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .in('customer_phone', variants.slice(0, 25))
      .in('payment_status', STATUS_PAGO)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error || !Array.isArray(data)) return null;
    pagos = data.map(mapSupabaseOrderToFirestore).filter(Boolean);
  } catch (err) {
    console.warn('[bonusAutomatico] Falha ao buscar pedidos pagos:', err?.message);
    return null;
  }

  for (const parent of pagos) {
    if (parent.id === orderIdAtual) continue;
    if (somenteMesmoDia && !pagoNoMesmoDia(parent, agora)) continue;
    const vinculado = bonusVinculadoId(parent);
    let pedidoVinculado = null;
    if (vinculado && vinculado !== orderIdAtual) {
      try {
        const { getOrder } = await import('./supabaseDb.js');
        pedidoVinculado = await getOrder(vinculado, env);
      } catch (err) {
        console.warn('[bonusAutomatico] Falha ao ler pedido vinculado ao bônus:', err?.message);
        continue; // na dúvida, não reaproveita
      }
    }
    if (bonusDisponivel(parent, { orderIdAtual, pedidoVinculado })) return parent;
  }
  return null;
}

/** Campos que transformam um pedido na 2ª geração (bônus) do pedido pago. */
export function camposDoBonus(parent, { automatico = true } = {}) {
  return {
    paymentStatus: 'PAGAMENTO_APROVADO',
    paidAmount: 0,
    paidSku: 'segunda_geracao_bonus',
    parentOrderId: parent.id,
    isSecondGeneration: true,
    hasVideoAccess: Boolean(parent.hasVideoAccess || parent.videoAddonPaid),
    hasCartaAccess: Boolean(parent.hasCartaAccess || parent.cartaAddonPaid),
    hasRetrospectivaAccess: Boolean(parent.hasRetrospectivaAccess || parent.retrospectivaAddonPaid),
    ...(automatico ? { bonusVinculadoPorTelefone: true, bonusVinculadoEm: new Date().toISOString() } : {}),
  };
}

/**
 * Transforma um pedido existente (não pago) no bônus do pedido pago e reserva o bônus no pai.
 * Devolve o número do pedido pago, para avisar o cliente.
 */
export async function vincularPedidoAoBonus(orderId, parent, env = {}) {
  const { updateOrder } = await import('./supabaseDb.js');
  await updateOrder(orderId, camposDoBonus(parent), env);
  try {
    await updateOrder(parent.id, { secondGenerationOrderId: orderId, segundaGeracaoOrderId: orderId }, env);
  } catch (err) {
    console.warn('[bonusAutomatico] Falha ao reservar o bônus no pedido pago:', err?.message);
  }
  return { parentOrderId: parent.id, parentOrderNumber: parent.orderNumber || null };
}
