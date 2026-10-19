import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { requireCustomer } from '@/lib/auth';
import { getCreditAccount } from '@/lib/credits';

export const runtime = 'edge';

export async function GET(req) {
  let env = {};
  try { env = getRequestContext()?.env || {}; } catch {}
  const customer = await requireCustomer(req, env);
  if (!customer.ok) return NextResponse.json({ error: customer.error }, { status: customer.status });
  try {
    return NextResponse.json(await getCreditAccount(customer.uid, env), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}
