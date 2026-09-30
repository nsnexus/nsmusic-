import { Suspense } from 'react';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';
import { buildRetrospectivaMetadata } from '@/lib/retrospectivaMetadata';
import { RetrospectivaView } from '@/app/retrospectiva/page';

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
      console.warn('[r/[id]/metadata] Falha ao buscar pedido para metadata:', err?.message);
    }
  }

  return buildRetrospectivaMetadata(orderId, order, env);
}

export default function ShortRetrospectivaPage({ params }) {
  const id = params?.id;

  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #2b1145 0%, #5b2a72 32%, #b06a9e 62%, #f3d9ea 100%)', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '50%', border: '4px solid #a855f7', borderTopColor: 'transparent', animation: 'spin 1s linear infinite' }} />
        </div>
      }
    >
      <RetrospectivaView orderId={id} />
    </Suspense>
  );
}
