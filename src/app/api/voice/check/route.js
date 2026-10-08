import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { findCustomerVoice } from '@/lib/customerVoices';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get('phone');

  if (!phone || phone.trim().length < 8) {
    return NextResponse.json({ found: false, error: 'Telefone não informado ou inválido.' }, { status: 400 });
  }

  try {
    const voiceData = await findCustomerVoice(phone, env);

    if (voiceData && voiceData.status === 'ativo' && voiceData.voiceId) {
      return NextResponse.json({
        found: true,
        voice: {
          phone: voiceData.phone,
          customerName: voiceData.customerName,
          voiceId: voiceData.voiceId,
          status: voiceData.status
        }
      });
    }

    return NextResponse.json({ found: false });
  } catch (err) {
    console.error('[voice/check] Erro ao consultar voz do cliente:', err.message);
    return NextResponse.json({ found: false, error: 'Erro ao consultar banco de dados.' }, { status: 500 });
  }
}
