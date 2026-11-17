import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';

// Aba "Países EUA" do painel: edita os países e ritmos da loja internacional (us.nsmusic.ia.br).
// Os bancos continuam separados — esta rota só repassa, servidor a servidor, para a API do site US,
// autenticada pela chave compartilhada US_PANEL_TOKEN (mesmo valor nos dois Workers).
const US_SITE_PADRAO = 'https://us.nsmusic.ia.br';

function lerEnv() {
  let env = {};
  try { const ctx = getRequestContext(); if (ctx?.env) env = ctx.env; } catch (e) { /* fora da Cloudflare */ }
  return env;
}

async function repassar(req, method) {
  const env = lerEnv();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const token = String(env.US_PANEL_TOKEN || process.env.US_PANEL_TOKEN || '').trim();
  if (token.length < 32) return NextResponse.json({ error: 'US_PANEL_TOKEN não configurado no painel brasileiro.' }, { status: 500 });
  const base = String(env.US_SITE_URL || process.env.US_SITE_URL || US_SITE_PADRAO).replace(/\/$/, '');

  let body;
  if (method === 'PUT') {
    const texto = await req.text();
    if (texto.length > 200000) return NextResponse.json({ error: 'Lista grande demais.' }, { status: 413 });
    try { const d = JSON.parse(texto); if (!Array.isArray(d?.countries)) throw new Error(); body = JSON.stringify({ countries: d.countries }); }
    catch { return NextResponse.json({ error: 'Envie { countries: [...] }.' }, { status: 400 }); }
  }

  try {
    const res = await fetch(`${base}/api/admin/countries`, {
      method,
      headers: { 'Content-Type': 'application/json', 'x-panel-token': token },
      body,
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Erros de validação do site US (400) são mensagens nossas, em português; o resto vira genérico.
      const msg = res.status === 400 && typeof data.error === 'string' ? data.error
        : res.status === 401 || res.status === 403 ? 'O site US recusou a chave. Confira se US_PANEL_TOKEN é igual nos dois Workers.'
        : 'O site US não respondeu. Tente de novo.';
      return NextResponse.json({ error: msg }, { status: res.status === 400 ? 400 : 502 });
    }
    return NextResponse.json({ countries: data.countries, defaults: data.defaults });
  } catch (e) {
    console.warn('[us-countries] falha ao falar com o site US:', e?.name || 'erro');
    return NextResponse.json({ error: 'O site US não respondeu. Tente de novo.' }, { status: 502 });
  }
}

export async function GET(req) { return repassar(req, 'GET'); }
export async function PUT(req) { return repassar(req, 'PUT'); }
