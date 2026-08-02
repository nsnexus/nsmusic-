// Templates de mensagem do WhatsApp — antes montados em 3 lugares diferentes com texto quase
// idêntico (ver M-19 no AUDIT_REPORT.md): src/lib/db.js, api/webhooks/mercadopago (agora
// src/lib/payments.js) e admin/pedidos/[id]/page.jsx.
//
// Este arquivo não importa nada específico de servidor (ao contrário de src/lib/whatsapp.js, que
// depende de @cloudflare/next-on-pages) para poder ser importado também por páginas client-side
// (o painel admin monta a mensagem no browser antes de enviá-la via /api/whatsapp/send).

import { SKU_PRICES } from './pricing';

function formatBRL(value) {
  return value.toFixed(2).replace('.', ',');
}

export function resolveDeliveryUrl(orderId) {
  const rawUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const baseUrl = (!rawUrl || rawUrl.includes('pages.dev') || rawUrl.includes('localhost'))
    ? 'https://nsmusic.nsnexus.com.br'
    : rawUrl;
  return `${baseUrl}/entrega?orderId=${orderId}`;
}

export function buildMusicReadyMessage({ customerName, honoreeName, deliveryUrl }) {
  return `Olá, ${customerName || 'Cliente'}! 🎵\n\nSua música personalizada para *${honoreeName || 'alguém especial'}* ficou pronta com sucesso no estúdio NSMusic!\n\nForam produzidas 2 versões completas em altíssima qualidade.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nQualquer dúvida, estamos à disposição! ❤️`;
}

export function buildPaymentApprovedMessage({ customerName, honoreeName, deliveryUrl }) {
  return `Olá, ${customerName || 'Cliente'}! 🎵\n\nSeu pagamento foi confirmado com sucesso!\nSua música personalizada para *${honoreeName || 'alguém especial'}* foi totalmente liberada no estúdio NSMusic.\n\nAcesse o link abaixo para ouvir e fazer o download dos seus áudios em MP3 HD:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
}

export function buildVideoApprovedMessage({ customerName, honoreeName, deliveryUrl }) {
  return `Olá, ${customerName || 'Cliente'}! 🎬\n\nSeu pagamento do *Vídeo Homenagem* foi confirmado com sucesso!\nAgora você pode enviar suas fotos para criar o vídeo personalizado para *${honoreeName || 'alguém especial'}*.\n\nAcesse o link abaixo para enviar as fotos:\n👉 ${deliveryUrl}\n\nObrigado pela preferência! ❤️`;
}

export function buildApprovalMessage({ isVideo, customerName, honoreeName, deliveryUrl }) {
  return isVideo
    ? buildVideoApprovedMessage({ customerName, honoreeName, deliveryUrl })
    : buildPaymentApprovedMessage({ customerName, honoreeName, deliveryUrl });
}

// Campanha manual (disparada pelo admin em lote, nunca automática): cliente gerou a prévia mas não
// pagou. Reaproveita o mesmo audio_only já composto — o link de /entrega mostra a prévia de novo.
export function buildRecoveryMessage({ customerName, honoreeName, deliveryUrl }) {
  const price = formatBRL(SKU_PRICES.audio_only);
  return `Olá, ${customerName || 'Cliente'}! 🎵\n\nA música que fizemos para *${honoreeName || 'alguém especial'}* continua esperando por você — sua prévia ainda está disponível!\n\nÚltima oportunidade de levar as 2 versões completas por apenas R$ ${price}:\n👉 ${deliveryUrl}\n\nQualquer dúvida, é só chamar! ❤️`;
}

// Campanha manual: cliente já pagou a música mas não o add-on de vídeo.
export function buildVideoUpsellMessage({ customerName, honoreeName, deliveryUrl }) {
  const price = formatBRL(SKU_PRICES.video_addon);
  return `Olá, ${customerName || 'Cliente'}! 🎬\n\nQue tal completar a homenagem para *${honoreeName || 'alguém especial'}* com um vídeo emocionante?\n\nPor apenas mais R$ ${price} você gera um Vídeo Homenagem com suas fotos, sincronizado com a música que já é sua:\n👉 ${deliveryUrl}\n\nÉ só enviar as fotos que a gente cuida do resto! ❤️`;
}

export function buildAdminSaleNotification({ customerName, honoreeName, isVideo }) {
  const dataStr = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return `💰 *NOVA VENDA NSMUSIC!*\n\n*Cliente:* ${customerName || 'Cliente'}\n*Homenageado:* ${honoreeName || 'alguém especial'}\n*Tipo:* ${isVideo ? '🎥 Vídeo Homenagem' : '🎵 Música Personalizada'}\n*Data:* ${dataStr}`;
}
