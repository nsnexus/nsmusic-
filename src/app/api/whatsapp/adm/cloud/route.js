import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { readEnvValue } from '@/lib/envValue';
import { processarRequisicaoCloudAdm } from '@/lib/whatsappAdmCloud';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Webhook do número ADM na API oficial da Meta. Use este endereço quando a Meta for configurada para
// mandar as mensagens do número ADM só para cá (override por número). Se o webhook do app já aponta
// para /api/whatsapp/webhook, não é preciso: aquela rota também entrega as mensagens do ADM para
// o mesmo tratamento (ver o início do POST dela).

function lerContexto() {
  let env = {};
  let waitUntil = null;
  try {
    const rc = getRequestContext();
    if (rc?.env) env = rc.env;
    if (rc?.ctx?.waitUntil) waitUntil = (p) => rc.ctx.waitUntil(p);
  } catch (e) {}
  return { env, waitUntil };
}

// Verificação do webhook (a Meta chama com hub.mode, hub.verify_token e hub.challenge).
export async function GET(req) {
  const { env } = lerContexto();
  const { searchParams } = new URL(req.url);
  const esperado = readEnvValue(env, 'WHATSAPP_WEBHOOK_VERIFY_TOKEN');
  if (searchParams.get('hub.mode') === 'subscribe' && esperado && searchParams.get('hub.verify_token') === esperado) {
    return new NextResponse(searchParams.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 });
}

export async function POST(req) {
  const { env, waitUntil } = lerContexto();
  const r = await processarRequisicaoCloudAdm(req, env, waitUntil);
  // Corpo que não é do número ADM: nada a fazer aqui.
  if (!r) return NextResponse.json({ ok: true, ignored: 'nao_e_do_adm' });
  return NextResponse.json(r.json, { status: r.status });
}
