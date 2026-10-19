import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getCreditPackage } from '@/lib/pricing';
import { createPixCharge } from '@/lib/efi';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const { packageSku } = await req.json();
    const pack = getCreditPackage(packageSku);
    if (!pack) return NextResponse.json({ error: 'Pacote de créditos inválido.' }, { status: 400 });
    const charge = await createPixCharge({ orderId: `CRED${customer.uid.slice(0, 12)}`, amount: pack.price, description: `Créditos NS Music: ${pack.label}` }, env);
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('Carteira indisponível neste ambiente.');
    const { error } = await supabase.from('credit_purchases').insert({
      user_id: customer.uid, package_sku: packageSku, credits: pack.credits, expected_amount: pack.price, txid: charge.txid
    });
    if (error) throw new Error('Não foi possível registrar a cobrança de créditos.');
    return NextResponse.json({ paymentId: charge.txid, qrCode: charge.pixCopiaECola, package: pack });
  } catch (error) {
    console.error('[credits/purchase] Falha ao criar cobrança:', error.message);
    return NextResponse.json({ error: 'Não foi possível gerar seu PIX de créditos. Tente novamente.' }, { status: 503 });
  }
}
