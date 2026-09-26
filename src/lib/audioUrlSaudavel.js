// Confere se uma URL de áudio REALMENTE entrega música antes de ela ser gravada no pedido.
//
// Regra, em uma frase: arquivo vazio não é arquivo — não salva, não usa, não grava no pedido.
//
// Histórico curto e caro (25/09/2026): a troca automática da URL de streaming pela definitiva foi
// ao ar sem conferir nada e gravou 404 por cima de streams que estavam tocando. A primeira correção
// passou a exigir status 200/206 e Content-Type de áudio — e ainda deixou passar, porque pedia
// `Range: bytes=0-1` e olhava só o cabeçalho: uma resposta de 2 bytes passava como "saudável".
//
// Agora o tamanho TOTAL do arquivo é obrigatório e precisa bater com o de uma música de verdade:
//   - `Content-Range: bytes 0-1/6101709` → total 6.101.709 (resposta 206, servidor respeitou Range);
//   - `Content-Length` → total, quando o servidor ignora Range e manda o arquivo inteiro (200).
// Sem nenhum dos dois, a URL é recusada: sem saber o tamanho, não dá para afirmar que tem música.
// É o mesmo piso usado no arquivamento (MIN_AUDIO_BYTES em src/lib/audioArchive.js).
const TIMEOUT_MS = 8000;
const MIN_AUDIO_BYTES = 100 * 1024; // 100 KB — abaixo disso não é música

function tamanhoTotal(res) {
  // 206 com Range respeitado: "bytes 0-1/6101709".
  const contentRange = res.headers.get('content-range');
  if (contentRange) {
    const total = Number(String(contentRange).split('/')[1]);
    if (Number.isFinite(total)) return total;
  }

  // 200 com o arquivo inteiro: Content-Length é o tamanho do arquivo.
  if (res.status === 200) {
    const len = Number(res.headers.get('content-length'));
    if (Number.isFinite(len)) return len;
  }

  return null;
}

export async function audioUrlSaudavel(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;

  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status !== 200 && res.status !== 206) return false;

    const tipo = String(res.headers.get('content-type') || '').toLowerCase();
    // A CDN da Kie.ai já devolveu página de erro HTML com status 200 (27 KB de texto).
    if (tipo.includes('text/') || tipo.includes('xml') || tipo.includes('json')) return false;
    if (tipo && !tipo.startsWith('audio/') && !tipo.includes('octet-stream')) return false;

    const total = tamanhoTotal(res);
    if (total === null) {
      // Resposta streaming chunked (ex: audiostream.kie.ai sem Content-Length):
      // confere se o stream responde com bytes reais de áudio
      if (res.body) {
        try {
          const reader = res.body.getReader();
          const { value } = await reader.read();
          reader.cancel().catch(() => {});
          if (value && value.byteLength > 0) return true;
        } catch (e) {}
      }
      return false;
    }

    return total >= MIN_AUDIO_BYTES;
  } catch (e) {
    return false;
  }
}
