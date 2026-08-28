import { NextResponse } from 'next/server';
import { isAllowedMediaUrl } from '@/lib/proxyAllowlist';

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

      // musicfile.kie.ai fica atrás de CloudFront com assinatura por path exato — qualquer sufixo
      // extra no path (mesmo só ".mp3") quebra a assinatura e a CDN responde 403 "MissingKey"
      // (confirmado ao vivo em 28/08/2026: a MESMA URL sem sufixo respondeu 200 com Content-Type
      // audio/mp3 já correto). Nunca acrescentar ".mp3" numa URL dessa CDN — nem aqui nem em
      // src/lib/db.js (que também parou de acrescentar). Pedido antigo cuja URL já foi salva com
      // ".mp3" grudado ainda funciona: stripKieMp3Suffix tenta a versão sem sufixo primeiro.
      const stripKieMp3Suffix = (u) => (u.includes('musicfile.kie.ai') && u.endsWith('.mp3')) ? u.slice(0, -4) : u;

      // Se a URL não for um link HTTP absoluto, adiciona os domínios da Kie.ai e Suno
      if (!formattedRaw.startsWith('http://') && !formattedRaw.startsWith('https://')) {
        const cleanPath = formattedRaw.replace(/^\/+/, '').replace(/\.mp3$/, '');
        candidates.push(`https://musicfile.kie.ai/${cleanPath}`);
        candidates.push(`https://cdn1.suno.ai/${cleanPath}`);
        candidates.push(`https://cdn2.suno.ai/${cleanPath}`);
      } else if (isAllowedMediaUrl(formattedRaw)) {
        // SSRF: só repassamos a URL absoluta ao fetch se o domínio estiver na allowlist
        // (ver A-06 no AUDIT_REPORT.md) — caso contrário, ignoramos e seguimos só com os
        // candidatos construídos a partir do itemId extraído abaixo.
        const withoutSuffix = stripKieMp3Suffix(formattedRaw);
        candidates.push(withoutSuffix);
        if (withoutSuffix !== formattedRaw) candidates.push(formattedRaw);
      }
    }

    if (itemId) {
      try {
        const b64 = btoa(itemId);
        candidates.push(`https://musicfile.kie.ai/${b64}`);
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
          },
          signal: AbortSignal.timeout(15000)
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
