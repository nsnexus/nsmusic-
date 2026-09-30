import { Suspense } from 'react';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { buildCartaMetadata } from '@/lib/cartaMetadata';
import { CartaView } from '@/app/carta/page';

export const runtime = 'edge';

export async function generateMetadata({ params }) {
  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  const orderId = params?.id;
  let order = null;
  if (orderId) {
    try {
      order = await getOrder(orderId, env);
    } catch (err) {
      console.warn('[c/[id]/metadata] Falha ao buscar pedido para metadata:', err?.message);
    }
  }

  return buildCartaMetadata(orderId, order, env);
}

export default function ShortCartaPage({ params }) {
  const id = params?.id;

  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #fffdf7 0%, #fdf2f8 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid #db2777', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <CartaView orderId={id} />
    </Suspense>
  );
}
