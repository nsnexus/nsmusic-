import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { lerEnvDaRequisicao } from '@/lib/adminRoute';
import { executarAutomacao } from '@/lib/instagramAutomacao';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Uma passada da automação de comentários do Instagram.
//
// Chamada de dois jeitos: pelo agendador (Bearer CRON_SECRET — hoje de carona no /api/cron/recover,
// a cada 15 min) e pelo painel, pelos botões "Rodar agora" e "Testar agora" (sessão de admin).
// A simulação (`simular: true`) só é aceita vinda do painel e não escreve nada no Instagram.
async function handle(req) {
  const env = lerEnvDaRequisicao();
  const cronSecret = String(env.CRON_SECRET || process.env.CRON_SECRET || '').trim();
  const authHeader = req.headers?.get?.('authorization') || '';

  let viaPainel = false;
  if (!(cronSecret && authHeader === `Bearer ${cronSecret}`)) {
    const adminAuth = await requireAdmin(req, env);
    if (!adminAuth.ok) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
    viaPainel = true;
  }

  let simular = false;
  if (viaPainel && req.method === 'POST') {
    const body = await req.json().catch(() => ({}));
    simular = body?.simular === true;
  }

  try {
    const resultado = await executarAutomacao({ env, simular });
    return NextResponse.json(resultado);
  } catch (err) {
    console.error('[cron/instagram-comments] Erro inesperado:', err.message);
    return NextResponse.json({ error: 'Falha ao rodar a automação de comentários.' }, { status: 500 });
  }
}

export async function GET(req) {
  return handle(req);
}

export async function POST(req) {
  return handle(req);
}
