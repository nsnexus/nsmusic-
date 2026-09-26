import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { getOrder } from '@/lib/supabaseDb';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';

export const runtime = 'edge';

// Classifica o formato do telefone sem nunca devolver o valor — BR válido (com código do país) é
// 12 ou 13 dígitos; fora disso é provável LID (ver achado 27/08/2026, route.js:extractSenderPhone).
function classifyPhoneDigits(raw) {
  if (!raw) return { present: false, digits: 0, looksLikeLid: false };
  const digits = String(raw).replace(/\D/g, '').length;
  return { present: true, digits, looksLikeLid: digits !== 12 && digits !== 13 };
}

// TODO(debug-temp): rota provisória pra diagnosticar por que uma notificação de WhatsApp não
// chegou. Busca por orderNumber, orderId, últimos dígitos do telefone, ou lista os N mais recentes
// (?recent=20) — nunca ecoa telefone/e-mail (ver .claude/rules/security.md), no modo recent nem o
// formato do orderNumber. Remover depois de checado.
export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const supabase = getSupabaseEdge(env);
    const { searchParams } = new URL(req.url);
    const orderNumber = searchParams.get('orderNumber');
    const orderId = searchParams.get('orderId') || searchParams.get('id');
    const phoneLast4 = searchParams.get('phoneLast4');
    const recentParam = searchParams.get('recent');
    const gatewayParam = searchParams.get('gateway');

    // ?gateway=N lista as cobranças do gateway (NSNexus Pay) mais recentes — usado para conferir se
    // alguma foi marcada como paga sem o pagamento ter caído de fato. Não expõe dados do pagador.
    if (gatewayParam) {
      const n = Math.min(Math.max(parseInt(gatewayParam, 10) || 30, 1), 100);
      let rows = [];
      if (supabase) {
        const { data } = await supabase
          .from('config')
          .select('chave, valor, created_at, updated_at')
          .like('chave', 'gateway_%')
          .order('updated_at', { ascending: false })
          .limit(n);

        if (Array.isArray(data)) {
          rows = data.map((d) => {
            const val = typeof d.valor === 'object' ? d.valor : {};
            return {
              txid: d.chave.replace('gateway_', ''),
              appId: val.appId || null,
              externalOrderId: val.externalOrderId || null,
              amount: val.amount ?? null,
              status: val.status || null,
              paidAmount: val.paidAmount ?? null,
              createdAt: val.createdAt || d.created_at || null,
              paidAt: val.paidAt || null,
              webhookSent: Boolean(val.webhookSent),
              webhookHttpStatus: val.webhookHttpStatus ?? null,
              temWebhookUrl: Boolean(val.webhookUrl),
            };
          });
        }
      }

      const pagas = rows.filter((r) => r.status === 'PAID');
      return NextResponse.json({
        total: rows.length,
        pagas: pagas.length,
        pendentes: rows.filter((r) => r.status === 'PENDING').length,
        porApp: rows.reduce((acc, r) => { acc[r.appId || 'sem-app'] = (acc[r.appId || 'sem-app'] || 0) + 1; return acc; }, {}),
        charges: rows,
      });
    }

    if (recentParam) {
      const n = Math.min(Math.max(parseInt(recentParam, 10) || 20, 1), 50);
      let rows = [];
      if (supabase) {
        const { data } = await supabase
          .from('orders')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(n);

        if (Array.isArray(data)) {
          rows = data.map((row) => {
            const d = mapSupabaseOrderToFirestore(row);
            return {
              id: d.id,
              orderNumber: d.orderNumber || null,
              createdAt: d.createdAt || null,
              productionStatus: d.productionStatus || null,
              paymentStatus: d.paymentStatus || null,
              whatsappRequested: Boolean(d.whatsappRequested),
              whatsappSenderPhone: classifyPhoneDigits(d.whatsappSenderPhone),
              whatsappWaitAckSent: Boolean(d.whatsappWaitAckSent),
              whatsappSent: Boolean(d.whatsappSent),
              whatsappSending: Boolean(d.whatsappSending),
              readyTemplateSent: Boolean(d.readyTemplateSent),
              paymentWhatsappSent: Boolean(d.paymentWhatsappSent),
              paymentWhatsappSending: Boolean(d.paymentWhatsappSending),
            };
          });
        }
      }
      return NextResponse.json({ count: rows.length, orders: rows });
    }

    if (!orderNumber && !orderId && !phoneLast4) {
      return NextResponse.json({ error: 'Informe orderNumber, orderId, phoneLast4 ou recent.' }, { status: 400 });
    }

    let found = null;

    if (orderId) {
      found = await getOrder(orderId, env);
    } else if (orderNumber) {
      found = await getOrder(orderNumber, env);
    } else if (phoneLast4 && supabase) {
      const { data } = await supabase
        .from('orders')
        .select('*')
        .is('deleted_at', null)
        .ilike('customer_phone', `%${phoneLast4}`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data && data[0]) {
        found = mapSupabaseOrderToFirestore(data[0]);
      }
    }

    if (!found) {
      return NextResponse.json({ error: 'Pedido não encontrado.' }, { status: 404 });
    }

    const { customerPhone, customerEmail, customerName, honoreeName, ...safe } = found;

    return NextResponse.json({
      id: found.id,
      hasPhone: Boolean(customerPhone),
      ...safe,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
