import { getRequestContext } from '@cloudflare/next-on-pages';

/**
 * Devolve as opções de applyPaymentApproval com `emSegundoPlano` ligado ao ctx.waitUntil da
 * requisição atual da Cloudflare. Fora do runtime da Cloudflare (testes, dev local) devolve `{}`
 * e a aprovação continua esperando os efeitos dentro da própria requisição, como antes.
 */
export function opcoesDeAprovacao() {
  try {
    const ctx = getRequestContext()?.ctx;
    if (ctx && typeof ctx.waitUntil === 'function') {
      return { emSegundoPlano: (promessa) => ctx.waitUntil(promessa) };
    }
  } catch {
    // getRequestContext lança fora do runtime da Cloudflare.
  }
  return {};
}
