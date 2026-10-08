import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { listAllCustomerVoices, resetCustomerVoice, saveCustomerVoice } from '@/lib/customerVoices';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const voices = await listAllCustomerVoices(env);
    return NextResponse.json({ ok: true, voices });
  } catch (err) {
    console.error('[admin/voice/customers] Erro ao listar vozes:', err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const body = await req.json();
    const { action, phone, ...rest } = body;

    if (!phone) {
      return NextResponse.json({ error: 'Telefone é obrigatório.' }, { status: 400 });
    }

    if (action === 'reset') {
      const res = await resetCustomerVoice(phone, env);
      return NextResponse.json(res);
    }

    if (action === 'save') {
      const res = await saveCustomerVoice({ phone, ...rest }, env);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/voice/customers] Erro ao processar:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
