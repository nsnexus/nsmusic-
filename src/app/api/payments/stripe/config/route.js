import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getStripeConfig } from '@/lib/stripe';

export const runtime = 'edge';

// Chave pública da Stripe para o formulário do cartão aparecer NA HORA (sem banco, sem cobrança).
// A cobrança só é criada quando o cliente toca em "Pagar" (/api/payments/stripe/intent).
export async function GET() {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch { /* fora da Cloudflare */ }
  const { publishableKey, secretKey } = getStripeConfig(env);
  if (!publishableKey || !secretKey) {
    return NextResponse.json({ error: 'Pagamento com cartão indisponível.' }, { status: 503 });
  }
  return NextResponse.json({ publishableKey }, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
