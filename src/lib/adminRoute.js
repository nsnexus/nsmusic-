// Abertura comum das rotas administrativas: resolve o `env` da Cloudflare e exige admin.
// Devolve { env, auth } quando autorizado, ou { resposta } com o erro pronto para retornar.
import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from './auth.js';

export function lerEnvDaRequisicao() {
  try {
    const ctx = getRequestContext();
    if (ctx?.env) return { ...ctx.env };
  } catch (e) {
    // Fora do runtime da Cloudflare (dev local, testes) getRequestContext lança: cai no process.env.
  }
  return {};
}

export async function abrirRotaAdmin(req) {
  const env = lerEnvDaRequisicao();
  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return { env, resposta: NextResponse.json({ error: auth.error }, { status: auth.status || 401 }) };
  }
  return { env, auth };
}
