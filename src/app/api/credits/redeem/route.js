import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getCreditCostForSku } from '@/lib/pricing';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const { orderId, sku } = await req.json();
    if (!orderId || typeof orderId !== 'string') return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
    const cost = getCreditCostForSku(sku);
    if (!['audio_only', 'video_addon', 'carta_addon', 'retrospectiva_addon', 'playback_addon', 'karaoke_addon', 'custom_voice_addon'].includes(sku)) {
      return NextResponse.json({ error: 'Produto inválido para pagamento com créditos.' }, { status: 400 });
    }
    const supabase = getSupabaseEdge(env);
    const { data, error } = await supabase.rpc('redeem_credits_for_order', { p_user_id: customer.uid, p_order_id: orderId, p_sku: sku });
    if (error) throw new Error('Não foi possível usar seus créditos agora.');
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.ok) return NextResponse.json({ error: result?.reason || 'Não foi possível concluir o resgate.', balance: result?.balance ?? null }, { status: 409 });
    return NextResponse.json({ success: true, cost, balance: result.balance });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
