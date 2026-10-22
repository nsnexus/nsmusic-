import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getOrder } from '@/lib/supabaseDb';

export const runtime = 'edge';

function setCorsHeaders(headers) {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type, Accept');
  headers.set('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
}

export async function OPTIONS() {
  const headers = new Headers();
  setCorsHeaders(headers);
  return new Response(null, { status: 204, headers });
}

export async function HEAD(req, { params }) {
  const getRes = await GET(req, { params });
  const headers = new Headers(getRes.headers);
  return new Response(null, { status: getRes.status, headers });
}

export async function GET(req, { params }) {
  try {
    let env = {};
    try {
      const ctx = getRequestContext();
      if (ctx?.env) env = ctx.env;
    } catch (e) {}

    const rawFilename = String(params?.filename || '').trim();
    if (!rawFilename) {
      return NextResponse.json({ error: 'Nome de arquivo obrigatório' }, { status: 400 });
    }

    // Extrai orderId de nomes como "preview_NS-1234.mp4", "preview_123.mp4" ou "123.mp4"
    const orderId = rawFilename
      .replace(/^preview_/i, '')
      .replace(/\.mp4$/i, '')
      .trim();

    if (!orderId) {
      return NextResponse.json({ error: 'ID do pedido inválido' }, { status: 400 });
    }

    const order = await getOrder(orderId, env);
    if (!order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    let videoUrl = order.previewVideoUrl || order.preview_video_url || order.extras?.previewVideoUrl || order.videoUrl || '';

    // Se o vídeo ainda não foi gerado, tenta gerar de forma síncrona se áudio e capa existirem
    if (!videoUrl) {
      try {
        const { triggerPreviewVideoRender } = await import('@/lib/videoPreview');
        const resRender = await triggerPreviewVideoRender(orderId, order, env, { sync: true });
        if (resRender.ok && resRender.previewUrl) {
          videoUrl = resRender.previewUrl;
        }
      } catch (renderErr) {
        console.warn(`[VideoStream] Tentativa de render sob demanda falhou para ${orderId}:`, renderErr?.message);
      }
    }

    if (!videoUrl) {
      return NextResponse.json({ error: 'Vídeo ainda não disponível para este pedido.' }, { status: 404 });
    }

    const rangeHeader = req.headers.get('range');
    const r2PublicUrl = String(env?.R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

    // 1. Leitura direta do binding Cloudflare R2 (env.nsmusic_media)
    if (env?.nsmusic_media && (videoUrl.includes('r2.dev') || (r2PublicUrl && videoUrl.startsWith(r2PublicUrl)))) {
      let objectKey = '';
      if (r2PublicUrl && videoUrl.startsWith(`${r2PublicUrl}/`)) {
        objectKey = videoUrl.slice(r2PublicUrl.length + 1).split('?')[0];
      } else {
        const urlObj = new URL(videoUrl);
        objectKey = urlObj.pathname.replace(/^\/+/, '');
      }

      if (objectKey) {
        try {
          const r2Options = {};
          if (rangeHeader) {
            r2Options.range = req.headers;
          }

          const obj = await env.nsmusic_media.get(objectKey, r2Options);
          if (obj) {
            const headers = new Headers();
            setCorsHeaders(headers);
            headers.set('Content-Type', obj.httpMetadata?.contentType || 'video/mp4');
            headers.set('Accept-Ranges', 'bytes');
            headers.set('Cache-Control', 'public, max-age=86400, must-revalidate');

            // Retorna 206 Partial Content estritamente quando o cabeçalho Range foi solicitado pelo cliente
            if (rangeHeader && obj.range) {
              const start = obj.range.offset;
              const length = obj.range.length;
              const end = start + length - 1;
              headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
              headers.set('Content-Length', String(length));
              return new Response(obj.body, { status: 206, headers });
            }

            headers.set('Content-Length', String(obj.size));
            return new Response(obj.body, { status: 200, headers });
          }
        } catch (r2Err) {
          console.warn(`[VideoStream] Falha ao ler R2 binding (${objectKey}):`, r2Err?.message);
        }
      }
    }

    // 2. Fallback de streaming via fetch com repasse de cabeçalho Range
    const fetchHeaders = {
      'User-Agent': 'NSMusic-VideoStream/1.0 (Meta-Cloud-API compatible)',
    };
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    const originRes = await fetch(videoUrl, {
      headers: fetchHeaders,
      signal: AbortSignal.timeout(25000),
    });

    if (!originRes.ok && originRes.status !== 206) {
      return NextResponse.json({
        error: `Falha ao carregar vídeo da origem (HTTP ${originRes.status})`
      }, { status: 502 });
    }

    const headers = new Headers();
    setCorsHeaders(headers);
    headers.set('Content-Type', originRes.headers.get('content-type') || 'video/mp4');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cache-Control', 'public, max-age=86400, must-revalidate');

    if (originRes.headers.has('content-length')) {
      headers.set('Content-Length', originRes.headers.get('content-length'));
    }
    if (originRes.headers.has('content-range')) {
      headers.set('Content-Range', originRes.headers.get('content-range'));
    }

    return new Response(originRes.body, {
      status: originRes.status === 206 ? 206 : 200,
      headers,
    });

  } catch (err) {
    console.error('[VideoStream] Erro ao servir vídeo:', err);
    return NextResponse.json({ error: 'Erro interno ao transmitir vídeo' }, { status: 500 });
  }
}
