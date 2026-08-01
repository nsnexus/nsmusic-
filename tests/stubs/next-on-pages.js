// Stub de teste para '@cloudflare/next-on-pages'.
// Fora do runtime da Cloudflare, getRequestContext() já lança em produção
// (código de produção sempre chama isso dentro de try/catch) — este stub
// reproduz o mesmo comportamento para os testes rodarem em Node puro.
export function getRequestContext() {
  throw new Error('getRequestContext() indisponível fora do runtime da Cloudflare (stub de teste)');
}
