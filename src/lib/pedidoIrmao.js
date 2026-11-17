// A página de entrega guarda o pedido da URL e, dentro dele, o pedido "irmão" em `relatedOrder`
// (música principal ↔ música bônus). Aplica uma alteração no pedido certo dos dois.
export function aplicarPatchNoPedido(pedido, idAlvo, patch) {
  if (!pedido) return pedido;
  const irmao = pedido.relatedOrder;
  if (irmao && idAlvo && irmao.id === idAlvo && pedido.id !== idAlvo) {
    return { ...pedido, relatedOrder: { ...irmao, ...patch } };
  }
  return { ...pedido, ...patch };
}
