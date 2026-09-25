// Quantas músicas uma pessoa pode gerar sem pagar.
//
// Regra (decidida pelo dono do estúdio em 25/09/2026):
//   - quem nunca pagou tem 5 gerações;
//   - cada compra paga acrescenta mais 5 à cota.
//
// Antes disso a regra era `!temPagamento && total >= 5`: quem pagasse UMA vez ficava com geração
// ilimitada para sempre. Um pagamento de R$ 9,99 liberava infinitas músicas — e a maior parte do
// custo do estúdio está justamente na geração, que acontece antes de qualquer pagamento.
//
// A contagem é por telefone/e-mail, do lado do servidor (ver api/orders/create) — o contador no
// localStorage do navegador é conveniência de tela, nunca a trava.

export const COTA_INICIAL = 5;
export const COTA_POR_COMPRA = 5;

// PAGO e PAGAMENTO_APROVADO são equivalentes (ver CLAUDE.md); 'approved' aparece em pedidos antigos.
const STATUS_PAGOS = new Set(['PAGO', 'PAGAMENTO_APROVADO', 'approved']);

export function pedidoFoiPago(pedido) {
  return STATUS_PAGOS.has(pedido?.paymentStatus);
}

/**
 * @param {Array<object>} pedidos pedidos já filtrados (sem deletedAt) da mesma pessoa
 * @param {{resetAt?: string}} [opcoes] `resetAt` (ISO) zera a contagem: pedidos criados ANTES dele
 *   não contam mais para a cota. É como o painel admin "libera" um cliente que estourou o limite —
 *   sem apagar pedido nenhum, o histórico continua inteiro para consulta e faturamento.
 * @returns {{cota: number, usados: number, pagos: number, restantes: number, bloqueado: boolean}}
 */
export function calcularCota(pedidos, opcoes = {}) {
  const corte = opcoes.resetAt ? Date.parse(opcoes.resetAt) : NaN;
  const lista = (Array.isArray(pedidos) ? pedidos : []).filter((p) => {
    if (!Number.isFinite(corte)) return true;
    const criado = Date.parse(p?.createdAt || '');
    // Pedido sem data legível conta: na dúvida, não invente cota extra para ninguém.
    return !Number.isFinite(criado) || criado >= corte;
  });
  const pagos = lista.filter(pedidoFoiPago).length;
  const cota = COTA_INICIAL + pagos * COTA_POR_COMPRA;
  const usados = lista.length;

  return {
    cota,
    usados,
    pagos,
    restantes: Math.max(0, cota - usados),
    bloqueado: usados >= cota,
  };
}
