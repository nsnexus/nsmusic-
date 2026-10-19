import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { requireCustomer } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    const page = Math.max(0, Math.min(10000, Number.parseInt(new URL(req.url).searchParams.get('page') || '0', 10) || 0));
    const supabase = getSupabaseEdge(env);
    if (!supabase) throw new Error('Conta indisponível.');
    const { data, error } = await supabase.from('orders')
      .select('id,order_number,honoree_name,cover_url,music_style,payment_status,production_status,created_at')
      .eq('user_id', customer.uid).is('deleted_at', null)
      .neq('production_status', 'RASCUNHO').neq('production_status', 'CONFIG')
      .order('created_at', { ascending: false }).range(page * 20, page * 20 + 20);
    if (error) throw error;
    return NextResponse.json({
      orders: (data || []).slice(0, 20).map(row => ({
        id: row.id, orderNumber: row.order_number, honoreeName: row.honoree_name,
        coverUrl: row.cover_url, musicStyle: row.music_style, paymentStatus: row.payment_status,
        productionStatus: row.production_status, createdAt: row.created_at,
      })), hasMore: (data || []).length > 20,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível carregar suas músicas. Tente novamente.' }, { status: 503 });
  }
}
