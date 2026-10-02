import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Consulta o saldo de créditos disponíveis na conta da Kie.ai.
 * Requer autenticação de administrador (token Supabase com role admin ou ADMIN_EMAILS).
 */
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
    }

    const apiKey = env.KIE_API_KEY || process.env.KIE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'KIE_API_KEY não configurada no ambiente do servidor.' },
        { status: 500 }
      );
    }

    const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      return NextResponse.json(
        { ok: false, error: `Kie.ai respondeu com status HTTP ${res.status}`, details: errText.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = await res.json().catch(() => null);
    if (!data || data.code !== 200) {
      return NextResponse.json(
        { ok: false, error: data?.msg || data?.message || 'Falha ao obter saldo na Kie.ai' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      credits: typeof data.data === 'number' ? data.data : Number(data.data) || 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/kie-credits] Erro ao consultar créditos na Kie.ai:', err.message);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro de conexão ao consultar créditos da Kie.ai' },
      { status: 500 }
    );
  }
}
