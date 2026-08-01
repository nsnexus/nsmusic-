import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const rawUrl = searchParams.get('url');

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL do áudio é obrigatória' }, { status: 400 });
    }

    // Aceita um parâmetro `id` explícito com o UUID do áudio (enviado pelo frontend)
    const explicitId = searchParams.get('id') || '';

    // Extrai o ID do áudio se for um link da Suno ou contiver UUID
    let itemId = explicitId;
    if (!itemId) {
      const matchId = rawUrl.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
      if (matchId && matchId[1]) {
        itemId = matchId[1];
      }
    }

    // Lista de URLs candidatas com fallback automático (múltiplas CDNs)
    const candidates = [];
    if (rawUrl) {
      let formattedRaw = String(rawUrl).trim();

      // Se a URL não for um link HTTP absoluto, adiciona os domínios da Kie.ai e Suno
      if (!formattedRaw.startsWith('http://') && !formattedRaw.startsWith('https://')) {
        const cleanPath = formattedRaw.replace(/^\/+/, '');
        candidates.push(`https://musicfile.kie.ai/${cleanPath}`);
        if (!cleanPath.endsWith('.mp3')) {
          candidates.push(`https://musicfile.kie.ai/${cleanPath}.mp3`);
        }
        candidates.push(`https://cdn1.suno.ai/${cleanPath}`);
        candidates.push(`https://cdn2.suno.ai/${cleanPath}`);
      } else {
        if (formattedRaw.includes('musicfile.kie.ai') && !formattedRaw.endsWith('.mp3')) {
          candidates.push(`${formattedRaw}.mp3`);
        }
        candidates.push(formattedRaw);
      }
    }

    if (itemId) {
      try {
        const b64 = btoa(itemId);
        candidates.push(`https://musicfile.kie.ai/${b64}.mp3`);
      } catch (e) {}
      candidates.push(`https://cdn1.suno.ai/${itemId}.mp3`);
      candidates.push(`https://cdn2.suno.ai/${itemId}.mp3`);
      candidates.push(`https://audiopipe.suno.ai/?item_id=${itemId}`);
    }

    let audioResponse = null;

    for (const targetUrl of candidates) {
      try {
        const res = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'audio/mpeg, audio/*, */*'
          }
        });

        if (res.ok && res.body) {
          const contentType = res.headers.get('content-type') || '';
          const contentLengthStr = res.headers.get('content-length');
          const contentLength = contentLengthStr ? parseInt(contentLengthStr, 10) : -1;

          if (contentLength === 0) {
            console.warn(`[Audio Proxy] URL ${targetUrl} retornou 0 bytes. Tentando próxima fonte...`);
            continue;
          }

          if (contentType.includes('audio') || contentType.includes('octet-stream') || targetUrl.endsWith('.mp3')) {
            audioResponse = res;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Audio Proxy] Falha ao buscar de ${targetUrl}:`, err?.message);
      }
    }

    if (!audioResponse || !audioResponse.body) {
      return NextResponse.json({ error: 'Não foi possível carregar o áudio de nenhuma fonte' }, { status: 502 });
    }

    const headers = new Headers();
    headers.set('Content-Type', audioResponse.headers.get('content-type') || 'audio/mpeg');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');

    const contentLength = audioResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 0) {
      headers.set('Content-Length', contentLength);
    }

    return new Response(audioResponse.body, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error("Erro no Proxy de Áudio:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
