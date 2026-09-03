// Criação da cobrança PIX vista do navegador, com retentativa.
//
// Existe porque a chamada a /api/payments/create falha de forma intermitente: ela atravessa o Worker
// de mTLS (que aborta em 8s) até a API Pix da Efí, que às vezes demora mais que isso. Insistir
// resolve na prática — clientes relataram ver o erro várias vezes seguidas e o código acabar
// aparecendo.
//
// Fica em src/lib porque os dois checkouts (/criar e /entrega) precisam do mesmo comportamento, e
// duas implementações separadas divergiriam justamente no caminho que gera receita.

const DEFAULT_ATTEMPTS = 3;

/**
 * Pede uma cobrança PIX ao servidor, insistindo algumas vezes antes de desistir.
 *
 * Nunca lança: devolve sempre um resultado, para o chamador decidir o que mostrar. O valor a cobrar
 * NUNCA vai no corpo — o servidor decide a partir do `sku` (ver src/lib/pricing.js e C-05) — com
 * uma única exceção deliberada: `amount` só é aceito quando `sku === 'impacto'` (página /pagar,
 * "pague conforme o impacto emocional"); o servidor valida um piso mínimo mesmo assim, nunca confia
 * cegamente no valor. Para qualquer outro SKU, `amount` é ignorado por quem chama esta função.
 *
 * @param {{orderId: string, sku: string, isSecondaryPayment?: boolean, amount?: number}} params
 * @param {{attempts?: number, onRetry?: (tentativa: number) => void}} [options]
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: string}>}
 */
export async function requestPixCharge({ orderId, sku, isSecondaryPayment = false, amount }, options = {}) {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS;
  let ultimoErro = 'Não foi possível gerar o código PIX agora.';

  for (let tentativa = 1; tentativa <= attempts; tentativa++) {
    try {
      const res = await fetch('/api/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, sku, isSecondaryPayment, amount }),
      });

      if (res.ok) {
        return { ok: true, data: await res.json() };
      }

      const errData = await res.json().catch(() => ({}));
      console.error('[pixCheckout] /api/payments/create respondeu', res.status, errData);
      ultimoErro = errData?.error || errData?.message || ultimoErro;

      // 4xx é decisão do servidor (pedido inexistente, SKU inválido) — repetir não muda o resultado.
      // Exceção: 424 (Failed Dependency) significa que a Efí falhou, não que o pedido está errado —
      // é transitório e insistir resolve. A rota usa 424 em vez de 502 porque a Cloudflare apaga o
      // corpo de respostas 502 vindas de uma Function (ver api/payments/create/route.js).
      if (res.status >= 400 && res.status < 500 && res.status !== 424) {
        return { ok: false, error: ultimoErro };
      }
    } catch (err) {
      console.error('[pixCheckout] Falha de rede ao criar a cobrança:', err?.message);
      ultimoErro = 'Não foi possível falar com o serviço de pagamento.';
    }

    if (tentativa < attempts) {
      if (options.onRetry) options.onRetry(tentativa);
      // Espera crescente: 1,5s e depois 3s. Curto o suficiente para o cliente não desistir, longo
      // o suficiente para a Efí se recuperar de uma lentidão momentânea.
      await new Promise((resolve) => setTimeout(resolve, 1500 * tentativa));
    }
  }

  return { ok: false, error: ultimoErro };
}
