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

    // O path do musicfile.kie.ai é o UUID da faixa em base64 (confirmado 28/08/2026:
    // atob('YTYxNjU2NmQ...') === 'a616566d-5033-4c98-9354-87593cdd958b'). Isso permite reconstruir a
    // URL do tempfile.aiquickdraw.com — a MESMA faixa, servida pela outra CDN da Kie.ai — a partir de
    // uma URL do musicfile, sem depender de nada gravado no pedido.
    const uuidFromKieBase64 = (u) => {
      try {
        const path = new URL(u).pathname.replace(/^\/+/, '').replace(/\.[a-z0-9]+$/i, '');
        const decoded = atob(path);
        return /^[a-f0-9-]{36}$/i.test(decoded) ? decoded : '';
      } catch (e) {
        return '';
      }
    };

    // Lista de URLs candidatas com fallback automático (múltiplas CDNs)
    const candidates = [];
    if (rawUrl) {
      let formattedRaw = String(rawUrl).trim();

      // INCIDENTE 28/08/2026: o musicfile.kie.ai começou a responder 200 com corpo VAZIO (0 bytes)
      // para faixas que minutos antes serviam o MP3 completo — não é expiração de assinatura (que dá
      // 403), é o arquivo sumindo do CDN. O tempfile.aiquickdraw.com continua servindo a mesma faixa
      // íntegra (5 MB, verificado). Por isso o tempfile vai PRIMEIRO na lista de candidatos sempre
      // que der pra derivar o UUID, e o musicfile fica só como reserva.
      const derivedUuid = formattedRaw.includes('musicfile.kie.ai') ? uuidFromKieBase64(formattedRaw) : '';
      if (derivedUuid) {
        candidates.push(`https://tempfile.aiquickdraw.com/r/${derivedUuid}.mp3`);
      }
      if (itemId) {
        candidates.push(`https://tempfile.aiquickdraw.com/r/${itemId}.mp3`);
      }

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
    let audioBuffer = null;
    // Diagnóstico opcional (?debug=1) — nunca aparece na resposta normal. Útil pra ver, de fora,
    // qual candidato falhou e por quê, sem depender do log do Workers.
    const debugMode = searchParams.get('debug') === '1';
    const attempts = [];

    // Acima disso faz streaming em vez de bufferizar (áudio nunca chega perto disso — uma música de
    // alguns minutos em MP3 fica entre 3 e 8 MB; o teto só existe pra não estourar a memória do
    // Worker se algum candidato devolver algo fora do esperado).
    const TAMANHO_MAX_BUFFER = 20 * 1024 * 1024;

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
            if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: 'content-length 0' });
            continue;
          }

          if (contentType.includes('audio') || contentType.includes('octet-stream') || targetUrl.endsWith('.mp3')) {
            // Achado 04/09/2026: o esquema anterior só conferia se o PRIMEIRO chunk não vinha vazio
            // (resolvia o incidente de 28/08, corpo totalmente vazio) — mas nunca verificava se o
            // corpo TERMINAVA de verdade. Se a conexão de origem cortasse no meio (arquivo ainda
            // sendo processado do lado da Kie.ai), o Worker repassava só o pedaço recebido, sem erro
            // nenhum: o <audio> tocava um trecho e parava ("não toca tudo"), e o MESMO arquivo curto
            // enviado como áudio pelo WhatsApp saía mudo (o app tenta recodificar pra Opus e falha
            // num MP3 truncado — como documento, sem recodificar, tocava normal).
            //
            // Agora bufferiza a resposta inteira (arrayBuffer espera o corpo completo — se a conexão
            // cair no meio, REJEITA em vez de devolver parcial) e, quando a origem informou
            // Content-Length, confere que o tamanho batido é exatamente esse. Corpo maior que
            // TAMANHO_MAX_BUFFER (nunca deveria acontecer com áudio de verdade) descarta esse
            // candidato e segue pro próximo da lista, sem tentar bufferizar algo grande demais.
            if (contentLength > TAMANHO_MAX_BUFFER) {
              if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: `maior que o teto de buffer (${contentLength} bytes)` });
              continue;
            }

            let buf;
            try {
              buf = await res.arrayBuffer();
            } catch (err) {
              if (debugMode) attempts.push({ url: targetUrl, error: `conexão cortada no meio do download: ${err?.message || 'erro desconhecido'}` });
              continue;
            }

            if (!buf || buf.byteLength === 0) {
              if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: 'corpo vazio' });
              continue;
            }

            if (contentLength > 0 && buf.byteLength !== contentLength) {
              console.warn(`[Audio Proxy] Arquivo truncado de ${targetUrl}: recebido ${buf.byteLength} de ${contentLength} bytes esperados.`);
              if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: `truncado: ${buf.byteLength}/${contentLength} bytes` });
              continue;
            }

            audioBuffer = buf;
            audioResponse = res;
            if (debugMode) attempts.push({ url: targetUrl, status: res.status, used: true, bytes: buf.byteLength });
            break;
          }

          if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: `content-type inesperado: ${contentType}` });
          continue;
        }

        if (debugMode) attempts.push({ url: targetUrl, status: res.status, skipped: 'resposta não-ok ou sem corpo' });
      } catch (err) {
        console.warn(`[Audio Proxy] Falha ao buscar de ${targetUrl}:`, err?.message);
        if (debugMode) attempts.push({ url: targetUrl, error: err?.message || 'erro desconhecido' });
      }
    }

    if (!audioResponse || !audioBuffer) {
      return NextResponse.json(
        debugMode
          ? { error: 'Não foi possível carregar o áudio de nenhuma fonte', attempts }
          : { error: 'Não foi possível carregar o áudio de nenhuma fonte' },
        { status: 502 }
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', audioResponse.headers.get('content-type') || 'audio/mpeg');
    // 1 dia com revalidação, não mais 1 ano "immutable" (incidente 28/08/2026): quando a CDN de
    // origem devolveu 200 com corpo vazio, esse cabeçalho fez o navegador do cliente guardar o
    // arquivo VAZIO por um ano — a prévia continuava quebrada mesmo depois da origem voltar ao
    // normal, e não havia como invalidar remotamente. O ganho de banda de cachear por um ano não
    // compensa o risco de congelar uma resposta ruim no navegador de quem já pagou.
    headers.set('Cache-Control', 'public, max-age=86400, must-revalidate');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Accept-Ranges', 'bytes');

    // ?download=<nome> faz o navegador BAIXAR em vez de tocar. Sem isso, quando o download pelo
    // JavaScript falha por qualquer motivo, o fallback (abrir a URL numa aba) só abre o player — foi
    // o que o cliente viu ao clicar em "Baixar" depois de pagar. Com Content-Disposition o download
    // acontece mesmo por link direto, sem depender de baixar o arquivo inteiro na memória da aba.
    const downloadName = searchParams.get('download');
    if (downloadName) {
      // Só ASCII seguro no filename: acento/emoji em cabeçalho HTTP quebra a resposta inteira.
      const safeName = downloadName.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'musica.mp3';
      headers.set('Content-Disposition', `attachment; filename="${safeName}"`);
    }

    // Do buffer de verdade, não do header da origem — já bufferizamos o corpo inteiro acima, então
    // isso é o tamanho real entregue (mais confiável que confiar de novo num header).
    headers.set('Content-Length', String(audioBuffer.byteLength));

    return new Response(audioBuffer, {
      status: 200,
      headers
    });

  } catch (error) {
    console.error("Erro no Proxy de Áudio:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
