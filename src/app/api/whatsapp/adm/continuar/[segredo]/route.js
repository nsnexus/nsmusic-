import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { carregarAdm, continuarEnvioAdm } from '@/lib/whatsappAdm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Continuação de um envio longo do robô do número ADM (Evolution). Com as pausas "de gente" entre os
// arquivos, mandar várias músicas passa dos ~30 s que a Cloudflare dá ao trabalho em segundo plano;
// o próprio robô chama esta rota com o que faltou e o envio segue aqui, com mais ~30 s.
// Protegida pelo mesmo segredo do webhook do ADM; só aceita arquivos do proxy de áudio do site.
export async function POST(req, { params }) {
  let env = {};
  let cfCtx = null;
  try {
    const rc = getRequestContext();
    if (rc?.env) env = rc.env;
    cfCtx = rc?.ctx || null;
  } catch (e) {
    // Fora do runtime da Cloudflare (dev local): segue com process.env.
  }

  let ctx;
  try {
    ctx = await carregarAdm(env);
  } catch (err) {
    console.warn('[whatsapp-adm/continuar] Falha ao carregar a configuração:', err?.name);
    return NextResponse.json({ error: 'Configuração indisponível.' }, { status: 503 });
  }

  const recebido = String(params?.segredo || '');
  if (!ctx.config.segredo || recebido !== ctx.config.segredo) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }
  if (!ctx.config.ligada) return NextResponse.json({ ok: true, ignored: 'desligada' });

  const body = await req.json().catch(() => null);
  if (!body?.destino || !Array.isArray(body.arquivos) || body.arquivos.length === 0) {
    return NextResponse.json({ error: 'destino e arquivos são obrigatórios.' }, { status: 400 });
  }

  const trabalho = continuarEnvioAdm(ctx, body.destino, body.arquivos);
  if (cfCtx?.waitUntil) cfCtx.waitUntil(trabalho);
  else await trabalho;

  return NextResponse.json({ ok: true });
}
