import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireAdmin } from '@/lib/auth';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { collection, query, where, orderBy, limit as fbLimit, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const auth = await requireAdmin(req, env);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status || 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';
  const search = (searchParams.get('search') || '').trim();
  const paymentStatus = searchParams.get('paymentStatus') || 'ALL';
  const productionStatus = searchParams.get('productionStatus') || 'ALL';
  const limitCount = Math.min(Math.max(Number(searchParams.get('limit')) || 200, 1), 1000);
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

  // 1. Tenta carregar do Supabase (Postgres indexado)
  try {
    const supabase = getSupabaseEdge(env);
    if (supabase) {
      let q = supabase.from('orders').select('*')
        .is('deleted_at', 'null')
        .neq('production_status', 'CONFIG')
        .neq('production_status', 'RASCUNHO');

      if (dateFrom) {
        const fromIso = dateFrom.includes('T') ? dateFrom : `${dateFrom}T00:00:00.000Z`;
        q = q.gte('created_at', fromIso);
      }
      if (dateTo) {
        const toIso = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
        q = q.lte('created_at', toIso);
      }

      if (paymentStatus && paymentStatus !== 'ALL') {
        if (paymentStatus === 'PAGO' || paymentStatus === 'PAGAMENTO_APROVADO') {
          q = q.in('payment_status', ['PAGO', 'PAGAMENTO_APROVADO']);
        } else {
          q = q.eq('payment_status', paymentStatus);
        }
      }

      if (productionStatus && productionStatus !== 'ALL') {
        q = q.eq('production_status', productionStatus);
      }

      if (search) {
        const safe = search.replace(/[,()]/g, '');
        q = q.or(`customer_name.ilike.*${safe}*,customer_phone.ilike.*${safe}*,customer_email.ilike.*${safe}*,honoree_name.ilike.*${safe}*,order_number.ilike.*${safe}*`);
      }

      q = q.order('created_at', { ascending: false }).limit(limitCount).offset(offset);

      const { data, error } = await q;
      if (!error && Array.isArray(data)) {
        const orders = data.map(mapSupabaseOrderToFirestore).filter(Boolean);
        return NextResponse.json({
          ok: true,
          orders,
          count: orders.length,
          source: 'supabase'
        }, {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
          }
        });
      }
    }
  } catch (sbErr) {
    console.warn('[admin/orders] Falha na consulta Supabase, caindo para Firestore:', sbErr.message);
  }

  // 2. Fallback resiliente no Firestore
  try {
    const ordersRef = collection(db, 'orders');
    const constraints = [];

    if (dateFrom) {
      const fromIso = dateFrom.includes('T') ? dateFrom : `${dateFrom}T00:00:00.000Z`;
      constraints.push(where('createdAt', '>=', fromIso));
    }
    if (dateTo) {
      const toIso = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59.999Z`;
      constraints.push(where('createdAt', '<=', toIso));
    }

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(fbLimit(limitCount));

    const snap = await getDocs(query(ordersRef, ...constraints));
    const orders = [];

    snap.forEach((d) => {
      const data = d.data();
      if (data.deletedAt || d.id.startsWith('config_') || d.id.startsWith('session_')) return;
      if (data.productionStatus === 'CONFIG' || data.productionStatus === 'RASCUNHO') return;

      if (paymentStatus && paymentStatus !== 'ALL') {
        const isPaid = data.paymentStatus === 'PAGO' || data.paymentStatus === 'PAGAMENTO_APROVADO';
        if (paymentStatus === 'PAGO' && !isPaid) return;
        if (paymentStatus !== 'PAGO' && data.paymentStatus !== paymentStatus) return;
      }

      if (productionStatus && productionStatus !== 'ALL' && data.productionStatus !== productionStatus) {
        return;
      }

      if (search) {
        const s = search.toLowerCase();
        const matches = (data.customerName || '').toLowerCase().includes(s) ||
          (data.customerPhone || '').toLowerCase().includes(s) ||
          (data.customerEmail || '').toLowerCase().includes(s) ||
          (data.honoreeName || '').toLowerCase().includes(s) ||
          (data.orderNumber || '').toLowerCase().includes(s);
        if (!matches) return;
      }

      orders.push({ id: d.id, ...data });
    });

    return NextResponse.json({
      ok: true,
      orders,
      count: orders.length,
      source: 'firestore'
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      }
    });

  } catch (err) {
    console.error('[admin/orders] Erro geral:', err.message);
    return NextResponse.json({ error: 'Erro ao listar pedidos' }, { status: 500 });
  }
}
