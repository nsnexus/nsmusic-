// Gerações extras de música do Pacote Família (19/11/2026).
//
// O pagamento do SKU `combo_familia` grava no pedido pago `geracoesExtras: 10` e uma lista vazia
// `geracoesExtrasPedidos` (ver payments.js). Cada geração extra é um PEDIDO NOVO do mesmo telefone
// (o cliente abre /criar de novo, conta outra história, escolhe outro estilo): na hora de gerar a
// música (suno/generate), se o pedido não está pago e não virou a 2ª geração bônus, procuramos um
// Pacote Família do mesmo telefone com saldo e o pedido novo sai PAGO, consumindo 1 do saldo.
//
// Mesmo desenho do bônus automático (bonusAutomatico.js), com duas diferenças:
//   - o vínculo fica em `familiaOrderId` (NÃO em parentOrderId), para o pedido extra não ser tratado
//     como "2ª geração" do pacote pelo resto do sistema (que só conhece UM filho por pedido);
//   - o saldo é consumido na hora de gerar, e pedido extra apagado devolve a geração (só conta pedido
//     que existe e já começou a gerar música).
//
// Corrida: dois pedidos gerando no mesmo segundo podem ler o mesmo saldo e consumir 1 a mais. É raro
// (o cliente gera uma música por vez) e o pior caso é 1 geração a mais para quem já pagou o pacote.

import { getSupabaseEdge } from './supabase-edge.js';
import { mapSupabaseOrderToFirestore } from './supabaseSync.js';
import { generatePhoneVariants } from './orderLookup.js';
import { pedidoEhPago, pedidoJaGerou } from './bonusAutomatico.js';

import { totalGeracoesExtras, pedidosQueUsaram, saldoGeracoesExtras } from './geracoesExtrasRegras.js';

export { totalGeracoesExtras, pedidosQueUsaram, saldoGeracoesExtras, pedidoEhGeracaoExtra } from './geracoesExtrasRegras.js';

async function carregarPedidos(ids, env) {
  if (ids.length === 0) return [];
  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from('orders').select('*').in('id', ids.slice(0, 50));
    if (error || !Array.isArray(data)) return null;
    return data.map(mapSupabaseOrderToFirestore).filter(Boolean).filter((p) => !p.deletedAt);
  } catch (err) {
    console.warn('[geracoesExtras] Falha ao carregar pedidos que usaram o pacote:', err?.message);
    return null;
  }
}

/** Procura, pelo telefone, um Pacote Família pago com geração extra sobrando. */
export async function encontrarPacoteComSaldo(phone, env = {}, { orderIdAtual = null, familiaRef = null } = {}) {
  const variants = generatePhoneVariants(phone);
  if (variants.length === 0) return null;
  const supabase = getSupabaseEdge(env);
  if (!supabase) return null;

  let pagos = [];
  try {
    const query = supabase
      .from('orders')
      .select('*')
      .in('customer_phone', variants.slice(0, 25))
      .in('payment_status', ['PAGO', 'PAGAMENTO_APROVADO'])
      .is('deleted_at', null)
      .filter('extras->>geracoesExtras', 'not.is', null)
      .order('created_at', { ascending: true })
      .limit(30);
    if (familiaRef) query.eq('id', familiaRef);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return null;
    pagos = data.map(mapSupabaseOrderToFirestore).filter(Boolean);
  } catch (err) {
    console.warn('[geracoesExtras] Falha ao buscar pedidos pagos:', err?.message);
    return null;
  }

  // O pacote mais antigo primeiro: gasta um pacote antes de começar o próximo.
  for (const pacote of pagos) {
    if (pacote.id === orderIdAtual || !pedidoEhPago(pacote) || totalGeracoesExtras(pacote) === 0) continue;
    const ids = pedidosQueUsaram(pacote).filter((id) => id !== orderIdAtual);
    const usados = await carregarPedidos(ids, env);
    if (usados === null) continue; // na dúvida, não consome
    if (saldoGeracoesExtras({ ...pacote, geracoesExtrasPedidos: ids }, usados) > 0) {
      return { pacote, idsValidos: ids.filter((id) => pedidoJaGerou(usados.find((p) => p.id === id))) };
    }
  }
  return null;
}

/** Campos que transformam um pedido numa geração extra (paga) do Pacote Família. Só a música. */
export function camposDaGeracaoExtra(pacote) {
  return {
    paymentStatus: 'PAGAMENTO_APROVADO',
    paidAmount: 0,
    paidSku: 'geracao_extra_familia',
    familiaOrderId: pacote.id,
    familiaOrderNumber: pacote.orderNumber || null,
    geracaoExtraEm: new Date().toISOString(),
    // A 2ª geração bônus é do pacote, não de cada geração extra.
    segundaGeracaoDisponivel: false,
  };
}

/**
 * Consome 1 geração extra do pacote para `orderId`. Devolve o número do pacote e quantas restam.
 * A lista do pacote é regravada só com os pedidos que de fato geraram (devolve as abandonadas).
 */
export async function usarGeracaoExtra(orderId, { pacote, idsValidos }, env = {}) {
  const { updateOrder } = await import('./supabaseDb.js');
  await updateOrder(orderId, camposDaGeracaoExtra(pacote), env);
  const lista = [...idsValidos, String(orderId)];
  try {
    await updateOrder(pacote.id, { geracoesExtrasPedidos: lista }, env);
  } catch (err) {
    console.warn('[geracoesExtras] Falha ao registrar o consumo no pacote:', err?.message);
  }
  return {
    familiaOrderId: pacote.id,
    familiaOrderNumber: pacote.orderNumber || null,
    restantes: Math.max(0, totalGeracoesExtras(pacote) - lista.length),
    total: totalGeracoesExtras(pacote),
  };
}
