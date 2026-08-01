import { NextResponse } from 'next/server';
import { verifyWhatsAppNumber } from '@/lib/whatsapp';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ exists: false, error: 'Telefone é obrigatório' }, { status: 400 });
    }

    const result = await verifyWhatsAppNumber(phone);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Erro na rota de verificação do WhatsApp:", error);
    return NextResponse.json({ exists: false, error: error.message }, { status: 500 });
  }
}
