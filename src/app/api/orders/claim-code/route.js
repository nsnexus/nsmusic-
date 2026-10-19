import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { hashOrderClaim } from '@/lib/orderClaim';
import { getEvolutionConfig, formatToWhatsAppNumber } from '@/lib/whatsapp';

export const runtime = 'edge';

export async function POST(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const { action, orderId, challengeId, code } = await req.json();
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('unavailable');
    if (action === 'verify') {
      if (!/^[a-f0-9-]{36}$/i.test(String(challengeId)) || !/^\d{6}$/.test(String(code))) return NextResponse.json({ error: 'Digite os seis números do código.' }, { status: 400 });
      const codeHash = await hashOrderClaim(`${code}:${challengeId}:${customer.uid}`);
      const { data, error } = await supabase.rpc('verify_order_claim_code', { p_id: challengeId, p_user_id: customer.uid, p_code_hash: codeHash });
      if (error) throw error;
      if (!data?.claimed) return NextResponse.json({ error: 'Código inválido, expirado ou limite de tentativas atingido.' }, { status: 403 });
      await supabase.rpc('reward_referral_for_order', { p_order_id: data.orderId, p_referee_user_id: customer.uid });
      return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (action !== 'request' || typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(orderId)) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
    const { data: order } = await supabase.from('orders').select('id,user_id,customer_phone').eq('id', orderId).is('deleted_at', null).maybeSingle();
    if (!order || (order.user_id && order.user_id !== customer.uid)) return NextResponse.json({ error: 'Não foi possível enviar um código para este pedido.' }, { status: 403 });
    const config = await getEvolutionConfig(env);
    const phone = formatToWhatsAppNumber(order.customer_phone);
    if (!config.enabled || !phone) return NextResponse.json({ error: 'O envio de código está indisponível. Fale com o suporte para guardar este pedido na conta.' }, { status: 503 });
    const id = crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint32Array(1));
    const otp = String(100000 + bytes[0] % 900000);
    const { data: reserved, error } = await supabase.rpc('reserve_order_claim_code', { p_id: id, p_user_id: customer.uid, p_order_id: orderId, p_phone_hash: await hashOrderClaim(phone), p_code_hash: await hashOrderClaim(`${otp}:${id}:${customer.uid}`) });
    if (error) throw error;
    if (!reserved) return NextResponse.json({ error: 'Aguarde um minuto antes de tentar novamente. Há um limite de envios por hora.' }, { status: 429 });
    // Scoped authentication message. Do not log provider bodies, phone numbers or OTPs.
    const sent = await fetch(`${config.baseUrl}/message/sendText/${encodeURIComponent(config.instanceName)}`, { method: 'POST', headers: { apikey: config.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ number: phone, text: `Seu código para guardar o pedido na sua conta NS Music é ${otp}. Ele vale por 5 minutos. Não compartilhe este código. Se você não solicitou, ignore esta mensagem.` }), signal: AbortSignal.timeout(10000) });
    if (!sent.ok) throw new Error('send_failed');
    return NextResponse.json({ challengeId: id, message: 'Enviamos o código para o WhatsApp informado no pedido.' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível concluir a verificação agora. Sua música continua salva. Tente novamente ou fale com o suporte.' }, { status: 503 });
  }
}
