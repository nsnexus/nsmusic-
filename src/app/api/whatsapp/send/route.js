import { NextResponse } from 'next/server';
import { sendWhatsAppMessageDetailed } from '@/lib/whatsapp';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function POST(req) {
  try {
    let envVars = process.env;
    try {
      if (getRequestContext().env) {
        envVars = getRequestContext().env;
      }
    } catch (e) {}

    const auth = await requireAdmin(req, envVars);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { phone, message } = await req.json();

    if (!phone || !message) {
      return NextResponse.json(
        { error: 'Campos "phone" e "message" são obrigatórios' },
        { status: 400 }
      );
    }

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
