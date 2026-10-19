import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { claimOrderForCustomer } from '@/lib/orderClaim';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const { orderId } = await req.json();
    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('Conta indisponível.');
    const claimed = await claimOrderForCustomer(req, supabase, customer.uid, orderId);
    if (!claimed) return NextResponse.json({ error: 'Não foi possível comprovar que este pedido é seu. Entre no aparelho onde você criou a música ou fale com o suporte.' }, { status: 403 });
    await supabase.rpc('reward_referral_for_order', { p_order_id: orderId, p_referee_user_id: customer.uid });
    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível vincular o pedido agora. Tente novamente.' }, { status: 503 });
  }
}
