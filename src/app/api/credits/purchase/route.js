import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getCreditPackage } from '@/lib/pricing';
import { createPixCharge, getChargeStatus } from '@/lib/efi';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { approveCreditPurchase } from '@/lib/credits';
import { confirmedPixAmount } from '@/lib/confirmedPixAmount';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const { packageSku, orderId = null, requestKey } = await req.json();
    const pack = getCreditPackage(packageSku);
    if (!pack) return NextResponse.json({ error: 'Pacote de créditos inválido.' }, { status: 400 });
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('Carteira indisponível neste ambiente.');
    const key = typeof requestKey === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(requestKey) ? requestKey : crypto.randomUUID();
    const txid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    const { data: reservation, error } = await supabase.rpc('reserve_credit_purchase', {
      p_user_id: customer.uid, p_sku: packageSku, p_order_id: orderId,
      p_request_key: key, p_txid: txid,
    });
    if (error || !reservation) throw new Error('Não foi possível reservar a cobrança ou a oferta não está disponível.');
    if (reservation.package_sku !== packageSku) return NextResponse.json({ error: 'Esta solicitação já corresponde a outro pacote.' }, { status: 409 });
    if (reservation.status === 'APROVADO') return NextResponse.json({ status: 'approved', paymentId: reservation.txid, package: pack });
    if (reservation.qr_code) return NextResponse.json({ paymentId: reservation.txid, qrCode: reservation.qr_code, package: pack }, { headers: { 'Cache-Control': 'no-store' } });
    // Recover the exact same txid after a network failure, including payment arriving first.
    const existing = await getChargeStatus(reservation.txid, env);
    if (existing?.status === 'CONCLUIDA') {
      const approval = await approveCreditPurchase(reservation.txid, confirmedPixAmount(existing), env);
      return NextResponse.json({ status: approval.approved ? 'approved' : 'pending', paymentId: reservation.txid, package: pack });
    }
    const charge = existing || await createPixCharge({ orderId: `CRED${customer.uid.slice(0, 12)}`, amount: Number(reservation.expected_amount), description: `Créditos NS Music: ${pack.label}`, txid: reservation.txid }, env);
    if (!charge.pixCopiaECola || (charge.status && charge.status !== 'ATIVA')) throw new Error('Esta cobrança não está mais disponível.');
    const stored = await supabase.from('credit_purchases').eq('id', reservation.id).update({ qr_code: charge.pixCopiaECola });
    if (stored.error) throw new Error('Não foi possível registrar o PIX. Tente novamente para recuperar a cobrança.');
    return NextResponse.json({ paymentId: reservation.txid, qrCode: charge.pixCopiaECola, package: pack }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[credits/purchase] Falha ao reservar ou recuperar cobrança.');
    return NextResponse.json({ error: 'Não foi possível gerar seu PIX de créditos ou esta oferta não está disponível para sua conta. Tente novamente.' }, { status: 503 });
  }
}
