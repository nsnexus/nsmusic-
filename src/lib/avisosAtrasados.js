// ATUALIZAÇÃO 27/11/2026: "música pronta" e "pagamento aprovado" voltaram a sair NA HORA
// (updateTaskResult e applyPaymentApproval). Este cron ficou como nova tentativa para os envios que
// falharam — as travas whatsappSent / paymentWhatsappSent impedem mensagem repetida.
//
// Histórico — WhatsApp só para quem sumiu (decisão do Narciso, 24/11/2026).
//
// Antes: "música pronta" saía na hora em que a Kie.ai terminava, e "pagamento aprovado" na hora do
// PIX — mesmo para quem estava com o site aberto, ouvindo a prévia ou já vendo a música. Era
// mensagem paga e risco de bloqueio do número à toa. Agora o cliente segue pelo site (e acha tudo
// depois em "Minhas músicas" pelo WhatsApp dele) e a mensagem só sai se ele não apareceu:
//
//  - Música pronta: 15 min depois de ficar pronta, se ninguém deu play na prévia e não pagou.
//  - Pagamento aprovado: 10 min depois do pagamento, se o cliente não abriu a página de entrega
//    depois de pagar (deliveryViewedAt, marcado pela /entrega).
//
// Roda de carona no cron de 10 em 10 min do /api/orders/reconcile. As travas de envio único
// (whatsappSent / paymentWhatsappSent) continuam em notifyMusicReady / notifyPaymentApproved.
import { getSupabaseEdge } from './supabase-edge.js';

export const ESPERA_MUSICA_MS = 15 * 60 * 1000;
export const ESPERA_PAGAMENTO_MS = 10 * 60 * 1000;
// Não ressuscita pedido velho: além disso, o cliente já foi embora de vez (a régua de recuperação
// cuida de quem não pagou).
const JANELA_MS = 6 * 3600 * 1000;
// Poucos por passada, para espalhar o envio no tempo (mesmo cuidado da régua de recuperação).
const MAX_POR_PASSADA = 8;

/** Música pronta há 15+ min, sem play na prévia e sem pagamento? */
export function precisaAvisoMusica(linha, agora) {
  if (!linha || linha.preview_listened_at || linha.paid_at) return false;
  const pronta = Date.parse(linha.music_ready_at || linha.created_at || '');
  if (Number.isNaN(pronta)) return false;
  return agora - pronta >= ESPERA_MUSICA_MS;
}

/** Pagou há 10+ min e não abriu a entrega depois de pagar? */
export function precisaAvisoPagamento(linha, agora) {
  if (!linha?.paid_at) return false;
  const pago = Date.parse(linha.paid_at);
  if (Number.isNaN(pago) || agora - pago < ESPERA_PAGAMENTO_MS) return false;
  const visto = Date.parse(linha.delivery_viewed_at || '');
  // Folga de 2 min: a entrega costuma marcar a visita no mesmo instante em que vê o pagamento.
  return Number.isNaN(visto) || visto < pago - 2 * 60 * 1000;
}

export async function enviarAvisosAtrasados(env = {}, agoraDate = new Date()) {
  const supabase = getSupabaseEdge(env);
  if (!supabase) return { musica: 0, pagamento: 0, error: 'Supabase não configurado' };
  const agora = agoraDate.getTime();
  const desde = new Date(agora - JANELA_MS).toISOString();
  const resultado = { musica: 0, pagamento: 0 };

  const { notifyMusicReady } = await import('./db.js');
  const { notifyPaymentApproved } = await import('./payments.js');

  // 1) Música pronta e ninguém ouviu
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, created_at, paid_at, preview_listened_at, music_ready_at:extras->>musicReadyAt')
      .gte('created_at', desde)
      .lte('created_at', new Date(agora - ESPERA_MUSICA_MS).toISOString())
      .not('audio_url', 'is', null)
      .not('customer_phone', 'is', null)
      .is('preview_listened_at', null)
      .is('paid_at', null)
      .is('deleted_at', null)
      .eq('whatsapp_sent', false)
      .eq('ready_template_sent', false)
      .order('created_at', { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    const alvos = (data || []).filter((l) => precisaAvisoMusica(l, agora)).slice(0, MAX_POR_PASSADA);
    for (const l of alvos) {
      try {
        const r = await notifyMusicReady(l.id, null, l.id, {}, env);
        if (r?.sent) resultado.musica += 1;
      } catch (e) {
        console.warn('[avisosAtrasados] Falha no aviso de música pronta:', e?.message);
      }
    }
  } catch (e) {
    console.warn('[avisosAtrasados] Consulta de música pronta falhou:', e?.message);
    resultado.errorMusica = e?.message;
  }

  // 2) Pagou e não voltou para ver
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, paid_at, delivery_viewed_at:extras->>deliveryViewedAt')
      .gte('paid_at', desde)
      .lte('paid_at', new Date(agora - ESPERA_PAGAMENTO_MS).toISOString())
      .not('customer_phone', 'is', null)
      .is('deleted_at', null)
      .eq('payment_whatsapp_sent', false)
      .in('payment_status', ['PAGAMENTO_APROVADO', 'PAGO'])
      .order('paid_at', { ascending: true })
      .limit(50);
    if (error) throw new Error(error.message);
    const alvos = (data || []).filter((l) => precisaAvisoPagamento(l, agora)).slice(0, MAX_POR_PASSADA);
    for (const l of alvos) {
      try {
        const r = await notifyPaymentApproved(l.id, null, {}, env);
        if (r?.success !== false) resultado.pagamento += 1;
      } catch (e) {
        console.warn('[avisosAtrasados] Falha no aviso de pagamento:', e?.message);
      }
    }
  } catch (e) {
    console.warn('[avisosAtrasados] Consulta de pagamentos falhou:', e?.message);
    resultado.errorPagamento = e?.message;
  }

  return resultado;
}
