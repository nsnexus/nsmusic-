import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req, { params }) {
  const { id } = params || {};
  if (!id) {
    return NextResponse.json({ error: 'ID do pedido não informado' }, { status: 400 });
  }

  const url = new URL(req.url);
  const downloadUrl = `${url.origin}/api/audio/proxy?orderId=${encodeURIComponent(id)}&faixa=1&download=NS-Music-Versao-2.mp3`;

  return NextResponse.redirect(downloadUrl, 302);
}
