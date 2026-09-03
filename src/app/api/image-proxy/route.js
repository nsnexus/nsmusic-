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

    // 30s, não 15s: o mesmo proxy serve o Vídeo Homenagem, que é ordens de grandeza maior que uma
    // capa e não cabia na janela pensada para imagem.
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      return NextResponse.json({ error: `Falha ao buscar arquivo: HTTP ${res.status}` }, { status: res.status });
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const isAllowedType = ALLOWED_CONTENT_TYPE_PREFIXES.some((prefix) => contentType.startsWith(prefix));
    if (!isAllowedType) {
      return NextResponse.json({ error: 'Tipo de conteúdo da origem não permitido.' }, { status: 502 });
    }

    if (!res.body) {
      return NextResponse.json({ error: 'Origem respondeu sem conteúdo.' }, { status: 502 });
    }

    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=86400'
    };

    // Repassa o tamanho quando a origem informa — é o que dá barra de progresso no download em vez
    // de "tamanho desconhecido".
    const contentLength = res.headers.get('content-length');
    if (contentLength) headers['Content-Length'] = contentLength;

    // ?download=<nome> faz o navegador BAIXAR em vez de abrir/tocar — mesmo contrato do
    // /api/audio/proxy. É por aqui que passa o download do vídeo homenagem.
    const downloadName = searchParams.get('download');
    if (downloadName) {
      // Só ASCII seguro: acento/emoji em cabeçalho HTTP quebra a resposta inteira.
      const safeName = downloadName.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'arquivo';
      headers['Content-Disposition'] = `attachment; filename="${safeName}"`;
    }

    // HÍBRIDO (achado 03/09/2026, segunda rodada): o streaming puro que substituiu o
    // `arrayBuffer()` (pro Vídeo Homenagem de 136 MB não estourar os 128 MB do Worker) criou um
    // problema novo — um cliente recebeu o vídeo com 46s em vez dos ~2min da música, porque o
    // slideshow usa este MESMO proxy como fallback pra baixar o ÁUDIO (ver
    // src/lib/videoGenerator.js:fetchAudioBytes), e repassar `res.body` direto arrisca entregar a
    // resposta cortada se a conexão de origem escorregar no meio — sem erro nenhum, o
    // decodeAudioData decodifica os bytes que chegaram e produz um áudio mais curto que o real.
    //
    // Pra arquivo pequeno/médio (o caso comum: capa, áudio, foto), `arrayBuffer()` garante o
    // arquivo COMPLETO antes de responder — não tem como entregar parte de um MP3 de 5 MB. Só o
    // Vídeo Homenagem (dezenas de MB, sem Content-Length às vezes) precisa do streaming.
    const tamanhoConhecido = Number(contentLength) || 0;
    const ARQUIVO_GRANDE_BYTES = 15 * 1024 * 1024; // 15 MB — acima da faixa de áudio/imagem normal

    if (tamanhoConhecido > 0 && tamanhoConhecido <= ARQUIVO_GRANDE_BYTES) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, { status: 200, headers });
    }

    // Sem Content-Length ou arquivo grande: streaming, mesmo com o risco de corte residual —
    // melhor que travar no limite de memória do Worker.
    return new NextResponse(res.body, { status: 200, headers });
  } catch (error) {
    console.error("Erro no image-proxy:", error);
    return NextResponse.json({ error: error.message || 'Erro interno no proxy' }, { status: 500 });
  }
}
