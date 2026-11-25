// Ajuste pago pelo chat de suporte (/suporte): o cliente troca o ritmo ou grava a letra ajustada de
// uma música JÁ PAGA por R$ 1 (preço do dono do estúdio, 25/11/2026).
//
// Fluxo:
//   1. criarCobrancaAjuste: o chat pede o ajuste → grava o que vai ser feito em
//      `ajustesPendentes[txid]` no pedido e cria uma cobrança Pix REAL na Efí, indexada em
//      order_payment_intents (assim o webhook da Efí acha o pedido pelo txid).
//   2. O pagamento cai → webhook da Efí OU polling de /api/payments/status → applyPaymentApproval
//      → SKU `ajuste_musica` → aplicarAjustePago (este módulo).
//   3. aplicarAjustePago confere o valor, garante que só UMA chamada executa (webhook e polling
//      correm em paralelo) e regera a música com o ajuste.
//
// Regras do projeto respeitadas aqui:
//   - valor vem do catálogo (pricing.js), nunca do cliente;
//   - nada é liberado sem a Efí confirmar (quem chama já consultou a Efí nesta requisição);
//   - o ajuste a aplicar vem do que o SERVIDOR gravou no pedido, não do corpo da requisição;
//   - paymentStatus e acessos a add-on não são tocados.

import { getPriceForSku } from './pricing.js';
import { createPixCharge, generateTxid } from './efi.js';
import { getSupabaseEdge } from './supabase-edge.js';
import { getOrder, updateOrder } from './supabaseDb.js';
import { regerarMusica } from './agentTools.js';
import { numeroDoDono } from './ownerPhone.js';

export const SKU_AJUSTE = 'ajuste_musica';
export const TIPOS_AJUSTE = new Set(['ritmo', 'letra']);
const PROVEDOR_LIVRE = 'efi';
const PROVEDOR_APLICADO = 'efi_ajuste_aplicado';

export function pedidoPago(p) {
  return p?.paymentStatus === 'PAGAMENTO_APROVADO' || p?.paymentStatus === 'PAGO';
}

function lerObjeto(p, campo) {
  const v = p?.[campo] ?? p?.extras?.[campo];
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function lerLista(p, campo) {
  const v = p?.[campo] ?? p?.extras?.[campo];
  return Array.isArray(v) ? v : [];
}

/** Impressão digital do áudio atual: muda quando uma versão nova é gravada. */
export function assinaturaAudio(p) {
  const faixas = (Array.isArray(p?.audioFiles) ? p.audioFiles.filter(Boolean) : []).concat(p?.audioUrl ? [p.audioUrl] : []);
  let h = 5381;
  for (const c of faixas.join('|')) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0;
  return faixas.length ? h.toString(36) : '';
}

export function limparEstilo(texto) {
  return String(texto || '').replace(/[^\p{L}\p{N} ,.&'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
}

async function avisarDono(texto, env) {
  try {
    const { sendWApiTextMessage } = await import('./whatsapp.js');
    await sendWApiTextMessage(numeroDoDono(env), texto, env);
  } catch (err) {
    console.warn('[ajustePago] Falha ao avisar o dono:', err?.message);
  }
}

/**
 * Cria o Pix de R$ 1 de um ajuste e grava o ajuste como pendente no pedido.
 * @param {object} pedido pedido já carregado do banco
 * @param {{tipo: 'ritmo'|'letra', estilo?: string}} ajuste
 * @returns {Promise<{ok: true, txid: string, pixCopiaECola: string, valor: number} | {ok: false, motivo: string}>}
 */
export async function criarCobrancaAjuste(pedido, ajuste, env = {}, { liberado = false } = {}) {
  if (!pedido?.id) return { ok: false, motivo: 'sem_pedido' };
  // `liberado`: música bônus cujo pedido principal está pago (conferido pelo servidor em
  // suporteChat.contextoDoPedido, nunca vindo do cliente).
  if (!pedidoPago(pedido) && !liberado) return { ok: false, motivo: 'pedido_nao_pago' };
  if (!TIPOS_AJUSTE.has(ajuste?.tipo)) return { ok: false, motivo: 'tipo_invalido' };

  const pendente = { tipo: ajuste.tipo, criadoEm: new Date().toISOString() };
  if (ajuste.tipo === 'ritmo') {
    const estilo = limparEstilo(ajuste.estilo);
    if (estilo.length < 3) return { ok: false, motivo: 'estilo_invalido' };
    pendente.estilo = estilo;
  } else {
    // A letra nova é a que o SERVIDOR gerou e guardou para o cliente aprovar (propostaDeLetra).
    const proposta = lerObjeto(pedido, 'ajusteLetraProposta');
    if (!proposta.letra || String(proposta.letra).length < 40) return { ok: false, motivo: 'sem_proposta_de_letra' };
    pendente.letra = String(proposta.letra);
    pendente.instrucao = String(proposta.instrucao || '').slice(0, 500);
  }

  const valor = getPriceForSku(SKU_AJUSTE);
  const supabase = getSupabaseEdge(env);
  if (!supabase || !valor) return { ok: false, motivo: 'indisponivel' };

  let cobranca;
  try {
    cobranca = await createPixCharge({
      orderId: pedido.id,
      amount: valor,
      description: `Ajuste de musica NS Music ${pedido.orderNumber || pedido.id}`,
      txid: generateTxid(pedido.id),
    }, env);
  } catch (err) {
    console.warn('[ajustePago] Falha ao criar a cobrança na Efí:', err?.efiStatus || err?.message);
    return { ok: false, motivo: 'falha_na_efi' };
  }
  if (!cobranca?.pixCopiaECola || !cobranca?.txid) return { ok: false, motivo: 'falha_na_efi' };

  // Insere direto (sem reserve_order_payment): a reserva reaproveita a cobrança do mesmo SKU por
  // 55 min, e o 2º ajuste seguido receberia de volta o Pix do 1º, já pago.
  const { error: erroIntent } = await supabase.from('order_payment_intents').insert({
    order_id: pedido.id,
    sku: SKU_AJUSTE,
    expected_amount: valor,
    txid: cobranca.txid,
    qr_code: cobranca.pixCopiaECola,
    provider: PROVEDOR_LIVRE,
  });
  if (erroIntent) {
    console.warn('[ajustePago] Falha ao registrar a cobrança:', erroIntent.message);
    return { ok: false, motivo: 'falha_ao_registrar' };
  }
  const registrado = await supabase.rpc('record_order_payment_intent', {
    p_order_id: pedido.id, p_txid: cobranca.txid, p_sku: SKU_AJUSTE, p_amount: valor,
  });
  if (registrado.error || !registrado.data) return { ok: false, motivo: 'falha_ao_registrar' };

  // Relê para não apagar outro ajuste pendente gravado entre a leitura do chat e agora.
  const atual = (await getOrder(pedido.id, env)) || pedido;
  await updateOrder(pedido.id, {
    ajustesPendentes: { ...lerObjeto(atual, 'ajustesPendentes'), [cobranca.txid]: pendente },
  }, env);

  return { ok: true, txid: cobranca.txid, pixCopiaECola: cobranca.pixCopiaECola, valor };
}

/**
 * Só UMA chamada aplica cada ajuste: troca o provider da cobrança de 'efi' para
 * 'efi_ajuste_aplicado' com filtro no próprio UPDATE. O Postgres faz isso de forma atômica — quem
 * receber a linha de volta ganhou; webhook e polling simultâneos não regeram duas vezes.
 */
async function reservarExecucao(txid, env) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('order_payment_intents')
    .eq('txid', txid)
    .eq('provider', PROVEDOR_LIVRE)
    .update({ provider: PROVEDOR_APLICADO });
  if (error) {
    console.warn('[ajustePago] Falha ao reservar a execução do ajuste:', error.message);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

/**
 * Chamado por applyPaymentApproval para o SKU `ajuste_musica`, DEPOIS de a Efí confirmar a cobrança.
 * @returns {Promise<{applied: boolean, reason?: string, sku: string, ajuste?: object}>}
 */
export async function aplicarAjustePago(orderData, txid, payment, env = {}, deps = {}) {
  const regerar = deps.regerarMusica || regerarMusica;
  const reservar = deps.reservarExecucao || reservarExecucao;
  const avisar = deps.avisarDono || avisarDono;
  const base = { sku: SKU_AJUSTE };

  if (!orderData?.id || !txid) return { ...base, applied: false, reason: 'missing_arguments' };

  const preco = getPriceForSku(SKU_AJUSTE);
  const valorPago = Number(payment?.transaction_amount);
  if (!Number.isFinite(valorPago) || valorPago < preco - 0.01) {
    console.warn(`[ajustePago] Valor pago abaixo do preço do ajuste no pedido ${orderData.id}.`);
    return { ...base, applied: false, reason: 'valor_divergente' };
  }

  const jaAplicados = lerLista(orderData, 'ajustePaymentIds').map((t) => String(t).toUpperCase());
  if (jaAplicados.includes(String(txid).toUpperCase())) return { ...base, applied: false, reason: 'already_processed' };

  if (!(await reservar(txid, env))) return { ...base, applied: false, reason: 'already_processed' };

  const pendentes = lerObjeto(orderData, 'ajustesPendentes');
  const pendente = pendentes[txid] || null;
  const agora = new Date().toISOString();

  let resultado = { ok: false, motivo: 'sem_ajuste_pendente' };
  if (pendente) {
    try {
      let pedido = orderData;
      if (pendente.tipo === 'letra' && pendente.letra) {
        await updateOrder(orderData.id, { lyrics: pendente.letra, lyricsAjustadaEm: agora, ajusteLetraProposta: null }, env);
        pedido = { ...orderData, lyrics: pendente.letra };
      }
      resultado = await regerar(pedido, { novoEstilo: pendente.tipo === 'ritmo' ? pendente.estilo : null, pago: true }, env);
    } catch (err) {
      console.warn('[ajustePago] Falha ao aplicar o ajuste:', err?.message);
      resultado = { ok: false, motivo: 'erro' };
    }
  }

  const { [txid]: _aplicado, ...restantes } = pendentes;
  const aplicados = lerLista(orderData, 'ajustesAplicados');
  await updateOrder(orderData.id, {
    ajustesPendentes: restantes,
    ajustePaymentIds: [...lerLista(orderData, 'ajustePaymentIds'), String(txid)],
    ajustesAplicados: [...aplicados, {
      txid: String(txid),
      tipo: pendente?.tipo || null,
      estilo: pendente?.estilo || null,
      valor: valorPago,
      pagoEm: agora,
      ok: Boolean(resultado.ok),
      motivo: resultado.ok ? null : resultado.motivo || null,
      taskId: resultado.taskId || null,
      assinaturaAntes: assinaturaAudio(orderData),
    }].slice(-30),
    ajustesValorPago: Math.round(((Number(orderData.ajustesValorPago ?? orderData.extras?.ajustesValorPago) || 0) + valorPago) * 100) / 100,
  }, env).catch((err) => console.warn('[ajustePago] Falha ao registrar o ajuste no pedido:', err?.message));

  if (!resultado.ok) {
    await avisar(
      `⚠️ *Ajuste pago não aplicado*\n\nPedido: ${orderData.orderNumber || orderData.id}\n`
      + `Cliente: ${orderData.customerName || '—'}\nAjuste: ${pendente?.tipo || 'não encontrado'}\n`
      + `Motivo: ${resultado.motivo || 'erro'}\n\nO cliente pagou R$ ${valorPago.toFixed(2)} pelo chat de suporte. Precisa refazer à mão.`,
      env
    );
  }

  return { ...base, applied: true, ajuste: { ok: Boolean(resultado.ok), tipo: pendente?.tipo || null } };
}
