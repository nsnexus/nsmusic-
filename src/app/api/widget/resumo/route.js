import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { calcularResumoDia } from '@/lib/resumoDia';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Números do dia para o widget da tela inicial (app Android "NS Music Widget").
// Só leitura de totais agregados (sem nome, telefone ou pedido). Autenticado pela chave
// WIDGET_TOKEN, enviada no cabeçalho Authorization: Bearer <chave>.

function iguais(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = { ...ctx.env };
  } catch (e) { /* fora da Cloudflare */ }

  const esperado = String(env.WIDGET_TOKEN || process.env.WIDGET_TOKEN || '').trim();
  if (esperado.length < 32) {
    return NextResponse.json({ error: 'WIDGET_TOKEN não configurado no servidor.' }, { status: 500 });
  }
  const recebido = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!iguais(recebido, esperado)) {
    return NextResponse.json({ error: 'Chave inválida.' }, { status: 401 });
  }

  try {
    const resumo = await calcularResumoDia(env);
    return NextResponse.json(resumo, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[widget/resumo] Falha ao calcular:', e?.name);
    return NextResponse.json({ error: 'Não foi possível calcular o resumo agora.' }, { status: 503 });
  }
}
