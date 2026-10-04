import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

/**
 * Consulta o saldo e informações da conta na Unifically.
 * Requer autenticação de administrador.
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

    const apiKey = env.UNIFICALLY_API_KEY || process.env.UNIFICALLY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: 'UNIFICALLY_API_KEY não configurada no servidor.' },
        { status: 500 }
      );
    }

    const res = await fetch('https://api.unifically.com/v1/account', {
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
        { ok: false, error: `Unifically respondeu com status HTTP ${res.status}`, details: errText.slice(0, 200) },
        { status: res.status }
      );
    }

    const data = await res.json().catch(() => null);
    if (!data || !data.success) {
      return NextResponse.json(
        { ok: false, error: data?.data?.message || data?.error_message || 'Falha ao obter saldo na Unifically' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      balance_usd: data.data?.balance_usd != null ? Number(data.data.balance_usd) : 0,
      email: data.data?.email || null,
      userId: data.data?.user_id || null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/unifically-credits] Erro ao consultar créditos na Unifically:', err.message);
    return NextResponse.json(
      { ok: false, error: err.message || 'Erro de conexão ao consultar créditos da Unifically' },
      { status: 500 }
    );
  }
}
