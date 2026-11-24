// Aviso no WhatsApp do dono quando um pedido cai no PIX estático (3º degrau do checkout:
// Efí e InfinitePay falharam). O PIX estático NÃO é confirmado automaticamente: o dinheiro cai,
// mas o site não fica sabendo, e o pedido precisa ser liberado à mão no painel.
import { numeroDoDono } from './ownerPhone.js';
import { sendWhatsAppTextMessage } from './whatsapp.js';

const DOMINIO = 'https://nsmusic.ia.br';
const brl = (n) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;

export function montarAvisoPixEstatico(pedido = {}, { sku = '', valor = 0 } = {}) {
  const id = pedido.id || '';
  return '⚠️ *PIX ESTÁTICO GERADO* (Efí e InfinitePay falharam)\n\n'
    + `📦 *Pedido:* ${pedido.orderNumber || id}\n`
    + `👤 *Cliente:* ${pedido.customerName || 'Cliente'}\n`
    + `📱 *WhatsApp:* ${pedido.customerPhone || 'sem telefone'}\n`
    + `🛒 *Pacote:* ${sku || '—'} · ${brl(valor)}\n\n`
    + 'Esse PIX *não é confirmado sozinho*. Se o cliente pagar, confira no extrato e libere o pedido no painel:\n'
    + `🔗 ${DOMINIO}/admin/pedidos/${id}`;
}

/** Nunca lança: falha de aviso não pode atrapalhar o checkout. */
export async function avisarDonoPixEstatico(pedido, info, env = {}) {
  try {
    await sendWhatsAppTextMessage(numeroDoDono(env), montarAvisoPixEstatico(pedido, info), env);
    return true;
  } catch (e) {
    console.warn('[avisoPixEstatico] Falha ao avisar o dono:', e?.message);
    return false;
  }
}
