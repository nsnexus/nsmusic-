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
    if (cost === null) {
      return NextResponse.json({ error: 'Produto inválido para pagamento com créditos.' }, { status: 400 });
    }
    const supabase = getSupabaseEdge(env);
    const { data, error } = await supabase.rpc('redeem_credits_for_order', { p_user_id: customer.uid, p_order_id: orderId, p_sku: sku });
    if (error) throw new Error('Não foi possível usar seus créditos agora.');
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.ok) return NextResponse.json({ error: result?.reason || 'Não foi possível concluir o resgate.', balance: result?.balance ?? null }, { status: 409 });

    if (sku === 'karaoke_addon') {
      try {
        const { numeroDoDono } = await import('@/lib/agentTools');
        const { sendWhatsAppTextMessage } = await import('@/lib/whatsapp');
        const { getOrder } = await import('@/lib/supabaseDb');
        const orderInfo = await getOrder(orderId, env).catch(() => null);
        const numPedido = orderInfo?.orderNumber || orderId;
        const nomeCliente = orderInfo?.customerName || customer.email || 'Cliente';
        const telCliente = orderInfo?.customerPhone || 'Sem telefone';
        const homenageado = orderInfo?.honoreeName || 'Homenageado';
        const estilo = orderInfo?.musicStyle || 'Estilo não informado';

        const msgKaraoke = `🎤 *VÍDEO KARAOKÊ RESGATADO COM CRÉDITOS!*\n\n`
          + `O cliente resgatou o Karaokê usando créditos da carteira e aguarda a sua produção manual.\n\n`
          + `📋 *Pedido:* ${numPedido}\n`
          + `👤 *Cliente:* ${nomeCliente} (${telCliente})\n`
          + `❤️ *Homenageado:* ${homenageado}\n`
          + `🎵 *Estilo:* ${estilo}\n\n`
          + `🔗 *Painel Admin:* https://nsmusic.com.br/admin/pedidos/${orderId}\n`
          + `🔗 *Página do Cliente:* https://nsmusic.com.br/entrega?orderId=${orderId}`;

        await sendWhatsAppTextMessage(numeroDoDono(env), msgKaraoke, env);
      } catch (errK) {
        console.warn('[credits/redeem] Falha ao notificar dono sobre resgate de Karaokê:', errK.message);
      }
    }

    return NextResponse.json({ success: true, cost, balance: result.balance });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
