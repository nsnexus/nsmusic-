import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getCreditPackage } from '@/lib/pricing';

export const runtime = 'edge';

export async function GET(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  const orderId = new URL(req.url).searchParams.get('orderId');
  if (!orderId || orderId.length > 80) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  try {
    const supabase = getSupabaseEdge(env);
    const { data, error } = await supabase.rpc('customer_second_song_offer', { p_user_id: customer.uid, p_order_id: orderId });
    if (error) throw error;
    return NextResponse.json({ ...data, package: getCreditPackage('creditos_pos_compra_1') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'A oferta está indisponível no momento. Sua música continua liberada.' }, { status: 503 });
  }
}
