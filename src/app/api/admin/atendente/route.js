import { NextResponse } from 'next/server';
import { abrirRotaAdmin } from '@/lib/adminRoute';
import { lerConfigAtendente, salvarConfigAtendente, conhecimentoPadrao } from '@/lib/atendenteConhecimento';

export const runtime = 'edge';

// Painel → Atendimentos → "Atendente com IA": liga/desliga e base de conhecimento do atendente
// do chat de suporte (src/lib/atendenteIA.js).
export async function GET(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;
  const config = await lerConfigAtendente(env);
  return NextResponse.json({ config, padrao: conhecimentoPadrao() });
}

export async function PUT(req) {
  const { env, resposta } = await abrirRotaAdmin(req);
  if (resposta) return resposta;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  if (typeof body.texto !== 'string') return NextResponse.json({ error: 'Faltou o texto do conhecimento.' }, { status: 400 });
  const r = await salvarConfigAtendente({ ligado: body.ligado !== false, texto: body.texto }, env);
  if (!r.ok) return NextResponse.json({ error: 'Não foi possível salvar.' }, { status: 500 });
  return NextResponse.json({ config: r.config });
}
