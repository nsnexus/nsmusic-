const PIX_KEY = '+5594991064043';
// Nome e cidade batem com o que está registrado de verdade na chave (confirmado com um Pix Copia e
// Cola real gerado pelo banco do dono da chave) — não é o nome fantasia da empresa. A maioria dos
// apps de banco ignora esses dois campos e busca o nome real no DICT pela chave, mas alinhar evita
// qualquer app mais rígido que compare o texto do QR.
const MERCHANT_NAME = 'NARCISO H F SANTOS';
const MERCHANT_CITY = 'PARAUAPEBAS';
const GUI = 'br.gov.bcb.pix';

function emv(id, value) {
  const len = String(value.length).padStart(2, '0');
  return `${id}${len}${value}`;
}

function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return ((crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'));
}

export function generateStaticTxid(orderId) {
  const base = String(orderId || 'ORDER').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);
  const suffix = Date.now().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let txid = ('NSMUSIC' + base + suffix).slice(0, 35);
  while (txid.length < 26) txid += '0';
  return txid;
}

// Estrutura idêntica, campo por campo, a um Pix Copia e Cola gerado pelo próprio banco do dono da
// chave (confirmado pagável em outro banco em teste real 2026-08-13) — sem campo de descrição (02)
// e sem txid real embutido no 62 (usa o marcador genérico "***" que o banco também usa). O txid
// retornado aqui é só para controle interno (Firestore/admin); nunca entra no payload do QR.
//
// `pixKey` é opcional — default é a chave do checkout normal (fallback paliativo do pagamento real).
// A página de apoio/gorjeta (/apoie) passa uma chave diferente (e-mail) sem afetar esse fallback.
export function generateStaticPixPayload(amount, orderId, pixKey = PIX_KEY) {
  const txid = generateStaticTxid(orderId);
  const valorStr = amount.toFixed(2);

  const mai = emv('00', GUI) + emv('01', pixKey);
  const field26 = emv('26', mai);
  const field62 = emv('62', emv('05', '***'));

  let payload =
    emv('00', '01') +
    emv('01', '11') +
    field26 +
    emv('52', '0000') +
    emv('53', '986') +
    emv('54', valorStr) +
    emv('58', 'BR') +
    emv('59', MERCHANT_NAME) +
    emv('60', MERCHANT_CITY) +
    field62 +
    '6304';

  const crc = crc16(payload);
  payload += crc;

  return { txid, pixCopiaECola: payload, status: 'ATIVA' };
}