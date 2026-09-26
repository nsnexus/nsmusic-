import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';

export const runtime = 'edge';

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const auth = await requireAdmin(req, env);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').toLowerCase().trim();
    const orderId = searchParams.get('orderId') || '';

    if (!search && !orderId) {
      return NextResponse.json({ error: 'Parâmetro search ou orderId é obrigatório' }, { status: 400 });
    }

    const supabase = getSupabaseEdge(env);
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase não inicializado.' }, { status: 500 });
    }

    if (orderId) {
      const { data: tasks, error: tErr } = await supabase
        .from('suno_tasks')
        .select('id, order_id, status, updated_at, result')
        .eq('order_id', orderId)
        .limit(20);

      if (tErr) {
        throw new Error(tErr.message);
      }

      const formatted = (tasks || []).map(t => ({
        taskId: t.id,
        orderId: t.order_id,
        status: t.status,
        updatedAt: t.updated_at,
        result: t.result ? 'HAS_DATA' : null
      }));
      return NextResponse.json({ tasks: formatted, count: formatted.length });
    }

    if (search) {
      const safeSearch = search.replace(/[,()]/g, '');
      const { data: orders, error: oErr } = await supabase
        .from('orders')
        .select('*')
        .is('deleted_at', null)
        .or(`customer_name.ilike.%${safeSearch}%,honoree_name.ilike.%${safeSearch}%,order_number.ilike.%${safeSearch}%,customer_phone.ilike.%${safeSearch}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      if (oErr) {
        throw new Error(oErr.message);
      }

      const results = (orders || []).map(o => ({
        id: o.id,
        orderNumber: o.order_number,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        honoreeName: o.honoree_name,
        paymentStatus: o.payment_status,
        productionStatus: o.production_status,
        audioUrl: o.audio_url || null,
        audioFiles: o.audio_files || [],
        sunoTaskId: o.suno_task_id || null,
        createdAt: o.created_at
      }));

      return NextResponse.json({ results, count: results.length });
    }

    return NextResponse.json({ results: [], count: 0 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
