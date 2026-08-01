import { NextResponse } from 'next/server';

export const runtime = 'edge';

function generatePixPayload(pixKey, merchantName, merchantCity, txid, amount) {
  const payloadFormat = "000201";
  const gui = "0014BR.GOV.BCB.PIX";
  const key = `01${pixKey.length.toString().padStart(2, '0')}${pixKey}`;
  const merchantAccount = `26${(gui.length + key.length).toString().padStart(2, '0')}${gui}${key}`;
  const merchantCategCode = "52040000";
  const transactionCurrency = "5303986";
  const amountStr = Number(amount).toFixed(2);
  const transactionAmount = `54${amountStr.length.toString().padStart(2, '0')}${amountStr}`;
  const countryCode = "5802BR";
  
  const mName = merchantName.substring(0, 25).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const merchantNameField = `59${mName.length.toString().padStart(2, '0')}${mName}`;
  
  const mCity = merchantCity.substring(0, 15).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const merchantCityField = `60${mCity.length.toString().padStart(2, '0')}${mCity}`;
  
  const txidStr = (txid || "NSMUSIC").substring(0, 25);
  const txidField = `05${txidStr.length.toString().padStart(2, '0')}${txidStr}`;
  const additionalDataField = `62${txidField.length.toString().padStart(2, '0')}${txidField}`;
  
  const payloadStart = payloadFormat + merchantAccount + merchantCategCode + transactionCurrency + transactionAmount + countryCode + merchantNameField + merchantCityField + additionalDataField + "6304";
  
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

    // Gera chave PIX Copia e Cola completo com valor e nome
    const pixKey = "94991064043"; // CPF
    const manualPaymentId = `manual_${Date.now()}`;
    const txid = orderId ? orderId.replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) : "NSMUSIC";
    
    const pixCopiaECola = generatePixPayload(pixKey, "Narciso Henrique Felizardo dos Santos", "Sao Paulo", txid, Number(totalAmount));

    if (orderId) {
      try {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const updatePayload = body.isSecondaryPayment 
          ? { videoPaymentId: manualPaymentId, updatedAt: new Date().toISOString(), manualPayment: true }
          : { paymentId: manualPaymentId, updatedAt: new Date().toISOString(), manualPayment: true };
          
        await updateDoc(doc(db, 'orders', orderId), updatePayload).catch(e => console.warn(e));
      } catch (e) {}
    }

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
