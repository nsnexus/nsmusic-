import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// Executado a cada 15 minutos via Cron Trigger do Worker efi-proxy (ver workers/efi-proxy/wrangler.toml)
// DESATIVADO: O cliente já recebe a notificação da música pronta diretamente pela Meta Cloud API Oficial
// assim que a geração conclui. A régua de recuperação via API não-oficial (Evolution) foi desativada
// para evitar mensagens repetidas e risco de banimento.
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const cronSecret = String(env.CRON_SECRET || process.env.CRON_SECRET || '').trim();
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET não configurada no servidor.' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    }

    return NextResponse.json({
      success: true,
      message: 'Régua de recuperação via WhatsApp não-oficial desativada (notificação oficial enviada na entrega).',
      results: { total: 0, eligible: 0, processed: 0, sent: [] }
    });

  } catch (err) {
    console.error("Erro no Cron de Recuperação:", err);
    return NextResponse.json({ error: 'Falha interna do Cron.' }, { status: 500 });
  }
}
