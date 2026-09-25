// Confere se uma URL de áudio REALMENTE entrega áudio antes de ela ser gravada no pedido.
//
// Achado em 25/09/2026, poucas horas depois de a troca automática entrar no ar: o endpoint
// `record-info` da Kie.ai devolve a URL do MP3 final ANTES de o arquivo existir. Trocamos a URL de
// streaming (que estava tocando) por uma que respondia 404 — a resposta tem 27.150 bytes de página
// de erro HTML, então "veio conteúdo" não prova nada. Resultado: cliente com player mudo, pior do
// que antes da correção.
//
// Regra: a origem tem que responder 200/206 E com Content-Type de áudio. Sem as duas coisas, a URL
// antiga fica onde está — um stream que morre em horas ainda é melhor que um link morto agora.
const TIMEOUT_MS = 8000;

export async function audioUrlSaudavel(url) {
  if (typeof url !== 'string' || !url.startsWith('http')) return false;

  try {
    // Range de 1 byte: prova que o arquivo existe sem baixar os ~6 MB dentro do Worker.
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-1' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status !== 200 && res.status !== 206) return false;

    const tipo = String(res.headers.get('content-type') || '').toLowerCase();
    if (tipo && !tipo.startsWith('audio/') && !tipo.includes('octet-stream')) return false;

    // Servidor que ignora Range devolve 200 com o arquivo inteiro; nesse caso o tamanho declarado
    // é o do arquivo. Zero byte é o modo de falha do audiostream.kie.ai depois que ele expira.
    const tamanho = Number(res.headers.get('content-length'));
    if (Number.isFinite(tamanho) && tamanho === 0) return false;

    return true;
  } catch (e) {
    return false;
  }
}
