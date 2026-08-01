import { NextResponse } from 'next/server';
import { doc, getDoc, updateDoc } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';
import { getPriceForSku } from '@/lib/pricing';

export const runtime = 'edge';

// Monta o campo 62 (Additional Data Field Template) do BR Code com um txid real.
// Com txid='***' (padrão), o resultado é byte-a-byte idêntico ao literal fixo usado antes de existir
// txid (ver A-10 no AUDIT_REPORT.md) — por isso os testes de caracterização do Lote 0 continuam válidos.
function buildAdditionalDataField(txid) {
  const sanitized = String(txid || '').replace(/[^A-Za-z0-9*]/g, '');
  const id = sanitized.slice(0, 25) || '***';
  const len = String(id.length).padStart(2, '0');
  const sub = `05${len}${id}`;
  const outerLen = String(sub.length).padStart(2, '0');
  return `62${outerLen}${sub}`;
}

export function generatePixPayload(amount, isVideo, txid = '***') {
  const amountStr = Number(amount).toFixed(2);
  const amountLen = amountStr.length.toString().padStart(2, '0');

  // Base exata gerada pelo aplicativo do banco do usuário para garantir compatibilidade 100%
  const part1Music = "00020101021126470014br.gov.bcb.pix0114+55949910640430207NSMusic52040000530398654";
  const part1Video = "00020101021126530014br.gov.bcb.pix0114+55949910640430213NSMusic Video52040000530398654";
  const part1 = isVideo ? part1Video : part1Music;
  const part2 = `${amountLen}${amountStr}`;
  const merchantInfo = "5802BR5922NARCISO H F DOS SANTOS6011PARAUAPEBAS";
  const additionalData = buildAdditionalDataField(txid);

  const payloadStart = part1 + part2 + merchantInfo + additionalData + "6304";

  let crc = 0xFFFF;
  for (let i = 0; i < payloadStart.length; i++) {
    crc ^= payloadStart.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc = crc << 1;
    }
    crc &= 0xFFFF;
  }
  const crcStr = crc.toString(16).toUpperCase().padStart(4, '0');

  return payloadStart + crcStr;
}

// txid alfanumérico único por cobrança (spec BR Code: até 25 caracteres, só letras/números).
function generateTxid(orderId) {
  const base = String(orderId || 'NSM').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  const suffix = Date.now().toString(36).toUpperCase();
  return `${base}${suffix}`.slice(0, 25);
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { orderId, sku: rawSku, isSecondaryPayment } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'orderId é obrigatório.' }, { status: 400 });
    }

    // Compatibilidade: enquanto todos os pontos de chamada não enviarem `sku` explícito,
    // deriva do flag legado isSecondaryPayment (video_addon vs audio_only).
    const sku = rawSku || (isSecondaryPayment ? 'video_addon' : 'audio_only');

    // O valor NUNCA vem do corpo da requisição — só do catálogo do servidor (ver C-05 no AUDIT_REPORT.md).
    const amount = getPriceForSku(sku);
    if (amount === null) {
      return NextResponse.json({ error: `SKU de produto inválido: ${sku}` }, { status: 400 });
    }

    const orderRef = doc(db, 'orders', orderId);
    const orderSnap = await getDoc(orderRef);
    if (!orderSnap.exists()) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const isVideo = sku === 'video_addon';
    const txid = generateTxid(orderId);
    const paymentIntentId = `manual_${Date.now()}`;
    const pixCopiaECola = generatePixPayload(amount, isVideo, txid);

    // Persiste a intenção de cobrança no pedido: é o que a aprovação (webhook/status) usa depois para
    // saber o que foi realmente cobrado, em vez de inferir pelo valor da transação (ver A-13).
    try {
      await updateDoc(orderRef, {
        paymentIntentId,
        paymentIntentSku: sku,
        expectedAmount: amount,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[api/payments/create] Falha ao persistir paymentIntent no pedido:', err.message);
      return NextResponse.json({ error: 'Falha ao registrar a intenção de pagamento. Tente novamente.' }, { status: 500 });
    }

    return NextResponse.json({
      paymentId: paymentIntentId,
      status: 'pending',
      qrCode: pixCopiaECola,
      qrCodeBase64: '', // Não teremos imagem QR code automático, o frontend vai lidar com a ausência
      ticketUrl: ''
    });

  } catch (error) {
    console.error("Erro ao criar pagamento manual:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
