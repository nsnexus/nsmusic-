// Endereço público do site, num lugar só.
//
// Antes disso a URL estava escrita à mão em 11 arquivos — metadados, JSON-LD, sitemap, robots,
// mensagens de WhatsApp e, o mais perigoso, os `callBackUrl` que a Kie.ai chama de volta quando a
// música fica pronta. Trocar de domínio esquecendo um desses lugares não dá erro de build: dá
// música que nunca chega no cliente, porque o callback bateu num host que não existe mais.
//
// Regra de troca de domínio: mudar DOMINIO_CANONICO aqui e NEXT_PUBLIC_SITE_URL no Cloudflare
// Pages **só depois** que o domínio novo já estiver respondendo. Ver docs/DOMINIO.md.

// Domínio oficial. É o fallback de tudo e o que aparece em canonical, sitemap e JSON-LD.
export const DOMINIO_CANONICO = 'https://nsmusic.nsnexus.com.br';

// Normaliza e rejeita o que não serve como endereço público: vazio, localhost (build local) e
// *.pages.dev (URL de preview da Cloudflare, que muda a cada deploy e não é indexável).
export function normalizarSiteUrl(valor) {
  const url = String(valor || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('pages.dev')) return '';
  return url;
}

// Valor usado em tempo de build (metadados, sitemap, robots, JSON-LD). `NEXT_PUBLIC_*` é embutido
// pelo Next na hora do build, então isto resolve para uma string fixa no bundle.
export const SITE_URL = normalizarSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) || DOMINIO_CANONICO;

// Para código que roda em rota Edge e tem o `env` da requisição em mãos (Kie.ai, Meta CAPI):
// prefere o valor da requisição e cai no canônico quando ele não serve.
export function resolverSiteUrl(valorDoEnv) {
  return normalizarSiteUrl(valorDoEnv) || DOMINIO_CANONICO;
}
