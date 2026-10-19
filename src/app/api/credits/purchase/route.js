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
  let stage = 'request';
  let packageSku;
  try {
    const body = await req.json();
    packageSku = body.packageSku;
    const { orderId = null, requestKey } = body;
    const pack = getCreditPackage(packageSku);
    if (!pack) return NextResponse.json({ error: 'Pacote de créditos inválido.' }, { status: 400 });
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('Carteira indisponível neste ambiente.');
    if (packageSku === 'creditos_pos_compra_1') {
      if (!orderId) return NextResponse.json({ error: 'Pedido obrigatório para esta oferta.' }, { status: 400 });
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
        return NextResponse.json({ error: 'Esta oferta é exclusiva para pedidos com Música + Vídeo (a partir de R$ 16,90).' }, { status: 409 });
      }
    }
    const key = typeof requestKey === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(requestKey) ? requestKey : crypto.randomUUID();
    const txid = crypto.randomUUID().replace(/-/g, '').toUpperCase();
    stage = 'reservation';
    const { data: reservation, error } = await supabase.rpc('reserve_credit_purchase', {
      p_user_id: customer.uid, p_sku: packageSku, p_order_id: orderId,
      p_request_key: key, p_txid: txid,
    });
    if (error) throw error;
    if (!reservation) throw new Error('reservation_missing');
    if (reservation.package_sku !== packageSku) return NextResponse.json({ error: 'Esta solicitação já corresponde a outro pacote.' }, { status: 409 });
    if (reservation.status === 'APROVADO') return NextResponse.json({ status: 'approved', paymentId: reservation.txid, package: pack });
    if (reservation.qr_code) return NextResponse.json({ paymentId: reservation.txid, qrCode: reservation.qr_code, package: pack }, { headers: { 'Cache-Control': 'no-store' } });
    // Recover the exact same txid after a network failure, including payment arriving first.
    stage = 'provider_lookup';
    const existing = await getChargeStatus(reservation.txid, env);
    if (existing?.status === 'CONCLUIDA') {
      const approval = await approveCreditPurchase(reservation.txid, confirmedPixAmount(existing), env);
      return NextResponse.json({ status: approval.approved ? 'approved' : 'pending', paymentId: reservation.txid, package: pack });
    }
    stage = 'provider_create';
    const charge = existing || await createPixCharge({ orderId: `CRED${customer.uid.slice(0, 12)}`, amount: Number(reservation.expected_amount), description: `Créditos NS Music: ${pack.label}`, txid: reservation.txid }, env);
    if (!charge.pixCopiaECola || (charge.status && charge.status !== 'ATIVA')) throw new Error('Esta cobrança não está mais disponível.');
    stage = 'store_charge';
    const stored = await supabase.from('credit_purchases').eq('id', reservation.id).update({ qr_code: charge.pixCopiaECola });
    if (stored.error) throw new Error('Não foi possível registrar o PIX. Tente novamente para recuperar a cobrança.');
    return NextResponse.json({ paymentId: reservation.txid, qrCode: charge.pixCopiaECola, package: pack }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const providerStatus = Number(error?.efiStatus || String(error?.message || '').match(/HTTP (\d{3})/)?.[1]) || null;
    const offerRejected = packageSku === 'creditos_pos_compra_1' && stage === 'reservation' && String(error?.message || '').includes('offer_not_eligible');
    const code = offerRejected ? 'CREDIT_OFFER_NOT_ELIGIBLE'
      : stage.startsWith('provider_') && [401, 403].includes(providerStatus) ? 'CREDIT_PIX_PROVIDER_AUTH'
      : stage === 'reservation' ? 'CREDIT_RESERVATION_FAILED'
      : stage === 'store_charge' ? 'CREDIT_PIX_SAVE_FAILED' : 'CREDIT_PIX_UNAVAILABLE';
    // Safe stage/status only: never log provider bodies, user identity, secrets or txids.
    console.error('[credits/purchase]', { stage, code, providerStatus });
    const message = offerRejected ? 'Esta oferta não está disponível para sua conta. Os pacotes normais continuam na sua carteira.'
      : code === 'CREDIT_PIX_PROVIDER_AUTH' ? 'O serviço PIX de créditos está indisponível por uma falha de configuração. Nenhum crédito foi debitado. Entre em contato com o suporte.'
      : code === 'CREDIT_RESERVATION_FAILED' ? 'Não foi possível iniciar a compra de créditos. Tente novamente ou fale com o suporte.'
      : code === 'CREDIT_PIX_SAVE_FAILED' ? 'Não foi possível recuperar o código PIX. Tente o mesmo pacote novamente para recuperar a cobrança.'
      : 'Não foi possível gerar o PIX de créditos agora. Tente novamente em instantes. Seu saldo não foi alterado.';
    return NextResponse.json({ error: message, code }, { status: offerRejected ? 409 : 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
