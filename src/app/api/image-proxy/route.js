import { NextResponse } from 'next/server';
import { isAllowedMediaUrl } from '@/lib/proxyAllowlist';

export const runtime = 'edge';

// Content-Types aceitos na resposta da origem. Qualquer outro (ex: text/html) é rejeitado para
// evitar que o proxy sirva HTML/JS arbitrário sob o próprio domínio (ver A-05 no AUDIT_REPORT.md).
const ALLOWED_CONTENT_TYPE_PREFIXES = ['image/', 'audio/', 'video/', 'application/octet-stream'];

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
      return NextResponse.json({ error: 'URL da imagem é obrigatória' }, { status: 400 });
    }

    if (!isAllowedMediaUrl(imageUrl)) {
      return NextResponse.json({ error: 'Domínio de origem não permitido para este proxy.' }, { status: 400 });
    }

    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      return NextResponse.json({ error: `Falha ao buscar imagem: HTTP ${res.status}` }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const isAllowedType = ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
    if (!isAllowedType) {
      return NextResponse.json({ error: 'Tipo de conteúdo da origem não permitido.' }, { status: 502 });
    }

    const blob = await res.arrayBuffer();

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    };

    // ?download=<nome> faz o navegador BAIXAR em vez de abrir/tocar — mesmo contrato do
    // /api/audio/proxy. É por aqui que passa o download do vídeo homenagem.
    const downloadName = searchParams.get('download');
    if (downloadName) {
      // Só ASCII seguro: acento/emoji em cabeçalho HTTP quebra a resposta inteira.
      const safeName = downloadName.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'arquivo';
      headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
    }

    return new NextResponse(blob, { status: 200, headers });
  } catch (error) {
    console.error("Erro no image-proxy:", error);
    return NextResponse.json({ error: error.message || 'Erro interno no proxy' }, { status: 500 });
  }
}
