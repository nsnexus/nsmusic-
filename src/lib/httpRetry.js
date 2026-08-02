// Retry com backoff exponencial para chamadas a APIs externas (ver B-08 no AUDIT_REPORT.md) —
// erro de rede ou 5xx tenta de novo; erro 4xx (ex: recurso não encontrado) não adianta repetir.
// Compartilhado entre o webhook e o polling de pagamento.
//
// `fetchImpl` permite injetar um fetch diferente do global (ex: o fetch com mTLS da Efí, obtido de
// um binding do Cloudflare Workers) sem duplicar a lógica de retry.
export async function fetchWithRetry(url, options, maxRetries = 2, fetchImpl = fetch) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchImpl(url, options);
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 300 * Math.pow(3, attempt)));
    }
  }
  throw lastError;
}
