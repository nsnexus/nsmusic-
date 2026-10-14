import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import {
  listVoiceInvites,
  createVoiceInvite,
  toggleVoiceInvite,
  updateVoiceInvite,
  deleteVoiceInvite
} from '@/lib/voiceInvites';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  try {
    const invites = await listVoiceInvites(env);
    return NextResponse.json({ ok: true, invites });
  } catch (err) {
    console.error('[admin/voice/invites] Erro ao listar convites:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro ao listar links de voz.' }, { status: 500 });
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
    const { action } = body;

    if (action === 'create') {
      const { customerName, phone, notes } = body;
      const res = await createVoiceInvite({ customerName, phone, notes }, env);
      return NextResponse.json(res);
    }

    if (action === 'toggle') {
      const { token, active } = body;
      if (!token) return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
      const res = await toggleVoiceInvite(token, active, env);
      return NextResponse.json(res);
    }

    if (action === 'link_contact') {
      const { token, phone, customerName } = body;
      if (!token) return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
      const res = await updateVoiceInvite(token, { phone, customerName }, env);
      return NextResponse.json(res);
    }

    if (action === 'delete') {
      const { token } = body;
      if (!token) return NextResponse.json({ error: 'Token é obrigatório.' }, { status: 400 });
      const res = await deleteVoiceInvite(token, env);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Ação não reconhecida.' }, { status: 400 });
  } catch (err) {
    console.error('[admin/voice/invites] Erro ao processar:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message || 'Erro ao processar convite.' }, { status: 500 });
  }
}
