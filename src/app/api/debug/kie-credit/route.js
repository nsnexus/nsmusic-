import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// TODO(debug-temp): rota provisória só pra consultar o saldo de créditos da Kie.ai. Remover depois
// de checado — não expõe a chave, só o número de créditos.
export async function GET() {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const apiKey = String(env?.KIE_API_KEY || process.env.KIE_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'KIE_API_KEY não configurada.' }, { status: 500 });
    }

    const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ status: res.status, data });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
