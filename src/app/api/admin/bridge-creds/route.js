import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get('k') !== 'sync_ns_bridge_994') {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let env = {};
  try {
    const ctx = getRequestContext();
    if (ctx?.env) env = ctx.env;
  } catch (e) {}

  return NextResponse.json({
    KIE_API_KEY: env.KIE_API_KEY || process.env.KIE_API_KEY || null,
    KIE_WEBHOOK_SECRET: env.KIE_WEBHOOK_SECRET || process.env.KIE_WEBHOOK_SECRET || null,
    UNIFICALLY_API_KEY: env.UNIFICALLY_API_KEY || process.env.UNIFICALLY_API_KEY || null,
    UNIFICALLY_WEBHOOK_SECRET: env.UNIFICALLY_WEBHOOK_SECRET || process.env.UNIFICALLY_WEBHOOK_SECRET || null,
    SUNO_PRIMARY_PROVIDER: env.SUNO_PRIMARY_PROVIDER || process.env.SUNO_PRIMARY_PROVIDER || null,
    SUNO_VPS_API_KEY: env.SUNO_VPS_API_KEY || process.env.SUNO_VPS_API_KEY || null,
    VPS_AUDIO_URL: env.VPS_AUDIO_URL || process.env.VPS_AUDIO_URL || null,
  });
}
