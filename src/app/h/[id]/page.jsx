import { Suspense } from 'react';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { buildHomenagemMetadata } from '@/lib/homenagemMetadata';
import { HomenagemView } from '@/app/homenagem/page';

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
      console.warn('[h/[id]/metadata] Falha ao buscar pedido para metadata:', err?.message);
    }
  }

  return buildHomenagemMetadata(orderId, order, env);
}

export default function ShortHomenagemPage({ params }) {
  const id = params?.id;

  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', backgroundColor: '#090d16', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid #ec4899', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <HomenagemView orderId={id} />
    </Suspense>
  );
}
