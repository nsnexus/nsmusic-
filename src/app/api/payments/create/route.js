import { NextResponse } from 'next/server';

export const runtime = 'edge';

function generatePixPayload(amount, isVideo) {
  const amountStr = Number(amount).toFixed(2);
  const amountLen = amountStr.length.toString().padStart(2, '0');
  
  // Base exata gerada pelo aplicativo do banco do usuário para garantir compatibilidade 100%
  const part1Music = "00020101021126470014br.gov.bcb.pix0114+55949910640430207NSMusic52040000530398654";
  const part1Video = "00020101021126530014br.gov.bcb.pix0114+55949910640430213NSMusic Video52040000530398654";
  const part1 = isVideo ? part1Video : part1Music;
  const part2 = `${amountLen}${amountStr}`;
  const part3 = "5802BR5922NARCISO H F DOS SANTOS6011PARAUAPEBAS62070503***6304";
  
  const payloadStart = part1 + part2 + part3;
  
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

export async function POST(req) {
  try {
    const body = await req.json();
    const { formData, totalAmount, paymentType = 'pix', orderId } = body;

    const manualPaymentId = `manual_${Date.now()}`;
    const pixCopiaECola = generatePixPayload(Number(totalAmount), !!body.isSecondaryPayment);

    // For manual payments, we don't strictly need to store the manual paymentId in Firestore immediately
    // because there is no automatic webhook for it. The user sends the receipt manually.

    return NextResponse.json({
      paymentId: manualPaymentId,
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
