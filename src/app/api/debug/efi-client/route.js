import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

// TODO(debug-temp): rota provisória só pra confirmar qual Client ID da Efi está ativo. Nunca expõe
// o Client Secret nem parte dele (ver .claude/rules/security.md). Remover depois de checado.
export async function GET() {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const clientId = String(env?.EFI_CLIENT_ID || process.env.EFI_CLIENT_ID || '').trim();
    const efiEnv = String(env?.EFI_ENV || process.env.EFI_ENV || '').trim() || 'sandbox';

    if (!clientId) {
      return NextResponse.json({ error: 'EFI_CLIENT_ID não configurada.' }, { status: 500 });
    }

    return NextResponse.json({
      efiEnv,
      clientIdLast6: clientId.slice(-6),
      clientIdLength: clientId.length,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
