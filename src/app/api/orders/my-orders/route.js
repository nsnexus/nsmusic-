import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getSupabaseEdge } from '@/lib/supabase-edge';
import { mapSupabaseOrderToFirestore } from '@/lib/supabaseSync';
import { generatePhoneVariants } from '@/lib/orderLookup';
import { collection, query, where, getDocs } from 'firebase/firestore/lite';
import { dbEdge as db } from '@/lib/firebase-edge';

export const runtime = 'edge';

export async function GET(req) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone')?.trim() || '';
    const email = searchParams.get('email')?.trim() || '';
    const userId = searchParams.get('userId')?.trim() || '';

    if (!phone && !email && !userId) {
      return NextResponse.json({ error: 'Informe telefone, e-mail ou userId para busca' }, { status: 400 });
    }

    const supabase = getSupabaseEdge(env);

    // 1. Busca no Supabase (Postgres)
    if (supabase) {
      try {
        let q = supabase.from('orders').select('*').is('deleted_at', 'null');

        if (phone) {
          const variants = generatePhoneVariants(phone);
          if (variants.length > 0) {
            q = q.in('customer_phone', variants.slice(0, 25));
          } else {
            return NextResponse.json({ orders: [] });
          }
        } else if (email) {
          q = q.ilike('customer_email', email);
        } else if (userId) {
          q = q.eq('user_id', userId);
        }

        const { data, error } = await q
          .neq('production_status', 'RASCUNHO')
          .neq('production_status', 'CONFIG')
          .order('created_at', { ascending: false })
          .limit(20);

        if (!error && Array.isArray(data)) {
          const orders = data.map(mapSupabaseOrderToFirestore).filter(Boolean);
          return NextResponse.json({ orders });
        }
      } catch (sbErr) {
        console.warn('[my-orders] Erro no Supabase:', sbErr.message);
      }
    }

    // 2. Fallback no Firestore
    try {
      const ordersRef = collection(db, 'orders');
      let docs = [];

      if (phone) {
        const variants = generatePhoneVariants(phone);
        const searchVariants = variants.slice(0, 10);
        for (const v of searchVariants) {
          const snap = await getDocs(query(ordersRef, where('customerPhone', '==', v)));
          if (!snap.empty) {
            docs.push(...snap.docs);
          }
        }
      } else if (email) {
        const [snap1, snap2] = await Promise.all([
          getDocs(query(ordersRef, where('customerEmail', '==', email))),
          getDocs(query(ordersRef, where('customerEmail', '==', email.toLowerCase())))
        ]);
        docs = [...snap1.docs, ...snap2.docs];
      } else if (userId) {
        const snap = await getDocs(query(ordersRef, where('userId', '==', userId)));
        docs = snap.docs;
      }

      const map = new Map();
      docs.forEach(d => {
        const data = d.data();
        if (!data.deletedAt && data.productionStatus !== 'RASCUNHO' && data.productionStatus !== 'CONFIG') {
          map.set(d.id, { id: d.id, ...data });
        }
      });

      return NextResponse.json({ orders: Array.from(map.values()) });
    } catch (fbErr) {
      console.error('[my-orders] Erro no Firestore fallback:', fbErr.message);
      return NextResponse.json({ orders: [] });
    }

  } catch (error) {
    console.error('[my-orders] Erro geral:', error.message);
    return NextResponse.json({ error: 'Erro ao buscar pedidos' }, { status: 500 });
  }
}
