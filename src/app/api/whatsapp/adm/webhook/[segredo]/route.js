import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { carregarAdm, tratarMensagemAdm } from '@/lib/whatsappAdm';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Webhook da instância do número ADM na Evolution API. O segredo vai no caminho da URL (gerado pelo
// painel e gravado na Evolution junto com o endereço), porque nem toda versão da Evolution permite
// mandar cabeçalho próprio no webhook.
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
    console.warn('[whatsapp-adm/webhook] Falha ao carregar a configuração:', err?.name);
    return NextResponse.json({ ok: true, ignored: 'config_indisponivel' });
  }

  const recebido = String(params?.segredo || '');
  if (!ctx.config.segredo || recebido !== ctx.config.segredo) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true, ignored: 'sem_corpo' });

  // Enviar vários MP3 leva mais tempo do que a Evolution espera pela resposta do webhook: responde
  // já e termina o trabalho em segundo plano.
  const trabalho = tratarMensagemAdm(body, env, ctx);
  if (cfCtx?.waitUntil) cfCtx.waitUntil(trabalho);
  else await trabalho;

  return NextResponse.json({ ok: true });
}
