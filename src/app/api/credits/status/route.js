import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getChargeStatus } from '@/lib/efi';
import { approveCreditPurchase } from '@/lib/credits';
import { confirmedPixAmount } from '@/lib/confirmedPixAmount';

export const runtime = 'edge';

export async function GET(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  const txid = new URL(req.url).searchParams.get('paymentId');
  if (!txid || !/^[A-Za-z0-9]{26,35}$/.test(txid)) return NextResponse.json({ error: 'Identificação de pagamento inválida.' }, { status: 400 });
  try {
    const supabase = getSupabaseEdge(env);
    const { data: purchase } = await supabase.from('credit_purchases').select('txid').eq('txid', txid).eq('user_id', customer.uid).maybeSingle();
    if (!purchase) return NextResponse.json({ error: 'Cobrança não encontrada.' }, { status: 404 });
    const charge = await getChargeStatus(txid, env);
    if (charge?.status !== 'CONCLUIDA') return NextResponse.json({ status: 'pending' });
    const result = await approveCreditPurchase(txid, confirmedPixAmount(charge), env);
    return NextResponse.json({ status: result.approved ? 'approved' : 'pending', balance: result.balance ?? null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('[credits/status] Falha ao consultar cobrança:', error.message);
    return NextResponse.json({ status: 'pending' });
  }
}
