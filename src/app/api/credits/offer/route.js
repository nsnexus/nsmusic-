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
    if (!supabase) throw new Error('Banco indisponível.');
    const { data: orderData } = await supabase
      .from('orders')
      .select('id, has_video_access, extras')
      .eq('id', orderId)
      .single();
    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('order_id', orderId);
    const totalPaid = (payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
    const hasVideo = Boolean(orderData?.has_video_access || orderData?.extras?.hasVideoAccess);
    if (!hasVideo && totalPaid < 16.89) {
      return NextResponse.json({ eligible: false, reason: 'minimo_compras_nao_atingido' });
    }
    const { data, error } = await supabase.rpc('customer_second_song_offer', { p_user_id: customer.uid, p_order_id: orderId });
    if (error) throw error;
    return NextResponse.json({ ...data, package: getCreditPackage('creditos_pos_compra_1') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'A oferta está indisponível no momento. Sua música continua liberada.' }, { status: 503 });
  }
}
