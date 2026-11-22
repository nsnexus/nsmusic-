// Regras puras das gerações extras do Pacote Família (sem banco): usadas no servidor
// (geracoesExtras.js) e na tela de entrega. Ver geracoesExtras.js para o desenho completo.

function jaGerou(order) {
  if (!order || order.deletedAt) return false;
  return Boolean(order.audioUrl || order.sunoTaskId || (Array.isArray(order.audioFiles) && order.audioFiles.length > 0));
}

function campo(order, nome) {
  if (!order) return undefined;
  return order[nome] !== undefined ? order[nome] : order.extras?.[nome];
}

/** Total de gerações extras compradas neste pedido (0 se não for Pacote Família). */
export function totalGeracoesExtras(order) {
  const n = Number(campo(order, 'geracoesExtras'));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Ids dos pedidos que já usaram uma geração extra deste pacote. */
export function pedidosQueUsaram(order) {
  const lista = campo(order, 'geracoesExtrasPedidos');
  return Array.isArray(lista) ? lista.filter(Boolean).map(String) : [];
}

/**
 * Saldo de gerações extras. `pedidosUsados` (opcional) são os pedidos da lista já carregados: pedido
 * apagado ou que nunca chegou a gerar não conta, e a geração volta para o saldo.
 */
export function saldoGeracoesExtras(order, pedidosUsados = null) {
  const total = totalGeracoesExtras(order);
  if (total === 0) return 0;
  const ids = pedidosQueUsaram(order);
  const usados = Array.isArray(pedidosUsados)
    ? ids.filter((id) => jaGerou(pedidosUsados.find((p) => p && (p.id === id || p.orderNumber === id))))
    : ids;
  return Math.max(0, total - usados.length);
}

/** Este pedido é uma geração extra de um Pacote Família? */
export function pedidoEhGeracaoExtra(order) {
  return Boolean(campo(order, 'familiaOrderId')) || order?.paidSku === 'geracao_extra_familia';
}

export function geracaoExtraJaLiberada(order) {
  return pedidoEhGeracaoExtra(order) && ['PAGO', 'PAGAMENTO_APROVADO'].includes(order.paymentStatus);
}

