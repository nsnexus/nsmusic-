import { NextResponse } from 'next/server';
import { sendWhatsAppMessageDetailed } from '@/lib/whatsapp';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(req) {
  try {
    const { phone, message } = await req.json();

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Campos "phone" e "message" são obrigatórios' },
        { status: 400 }
      );
    }

    let envVars = process.env;
    try {
      if (getRequestContext().env) {
        envVars = getRequestContext().env;
      }
    } catch (e) {}

    const result = await sendWhatsAppMessageDetailed(phone, message, envVars);

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Mensagem enviada com sucesso!' });
    } else {
      return NextResponse.json(
        { error: result.error || 'Falha ao enviar mensagem via W-API. Verifique se a instância está conectada.' },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Erro na rota /api/whatsapp/send:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}
