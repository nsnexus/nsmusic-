import { NextResponse } from 'next/server';
import { DOMINIO_CANONICO } from '@/lib/siteUrl';

export const runtime = 'edge';

export async function GET(req, { params }) {
  const { id } = params || {};
  if (!id) {
    return NextResponse.json({ error: 'ID do pedido não informado' }, { status: 400 });
  }

  const downloadUrl = `${DOMINIO_CANONICO}/api/audio/proxy?orderId=${encodeURIComponent(id)}&faixa=0&download=NS-Music-Versao-1.mp3`;

  return NextResponse.redirect(downloadUrl, 302);
}
