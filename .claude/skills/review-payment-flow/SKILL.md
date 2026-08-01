---
name: review-payment-flow
description: Revisa o fluxo de pagamento do NS Music (preço, webhook, idempotência, liberação do produto) antes de alterar qualquer coisa em api/payments, api/webhooks ou entrega. Use ao mexer em cobrança, aprovação de pedido ou acesso a conteúdo pago.
---

# Revisar o fluxo de pagamento

Procedimento de leitura dirigida. **Não altera arquivos.** Saída curta: no máximo 20 linhas.

## Contexto a carregar (nesta ordem, e só o necessário)

1. `docs/audit/AUDIT_REPORT.md` §6 — o quadro de requisitos versus estado real.
2. `.claude/rules/payments.md` — as restrições.
3. Só então os arquivos relevantes à mudança em questão.

Os quatro arquivos que formam o fluxo:

| Arquivo | Símbolo | Papel |
|---|---|---|
| `src/app/api/payments/create/route.js` | `generatePixPayload` | Gera o BR Code |
| `src/app/api/payments/status/route.js` | `markOrderApproved` | Aprovação via polling |
| `src/app/api/webhooks/mercadopago/route.js` | `processPayment` | Aprovação via webhook |
| `src/app/entrega/page.jsx` | `isPaid` (linha ~69) | Liberação do produto |

## Perguntas a responder com evidência (`arquivo:linha`)

1. O valor cobrado é derivado no servidor ou veio do cliente?
2. Existe caminho que marca o pedido como pago sem consultar o provedor?
3. O add-on de vídeo altera `paymentStatus`? (não deve)
4. As flags de idempotência usam `runTransaction`?
5. A alteração foi aplicada nos **dois** pontos que duplicam a aprovação?
6. `cancelled`/`refunded` revogam o acesso?

## Saída

Para cada pergunta: ✅ ou ❌ + `arquivo:linha`. Ao final, uma linha por risco novo introduzido.
Se faltar evidência para responder alguma pergunta, escreva "sem evidência" — não deduza.

## Não faça

- Não abra `criar/page.jsx` inteiro (2.789 linhas). Busque `getTotalPrice` e `totalAmount`.
- Não teste contra pedidos reais de clientes.
- Não conclua que algo está corrigido sem ter visto a linha corrigida.
