---
description: Regras para pagamento, webhooks e liberação de produto
globs:
  - "src/app/api/payments/**"
  - "src/app/api/webhooks/**"
  - "src/app/entrega/**"
  - "src/app/homenagem/**"
---

# Pagamentos

Área de maior risco do projeto. Ver `docs/audit/AUDIT_REPORT.md` §6 antes de alterar.

## Proibido

- Derivar o valor a cobrar de qualquer campo enviado pelo cliente (`totalAmount`, `price`, `amount`).
  O valor vem sempre de um catálogo no servidor.
- Derivar acesso a produto pago de `searchParams`, `localStorage`, `sessionStorage` ou props do cliente.
- Escrever `paymentStatus` a partir de código com `'use client'`.
- Aprovar um pedido sem ter consultado a API do provedor de pagamento nesta mesma requisição.
- Usar `===` em comparação de valor monetário. Use `Math.abs(a - b) < 0.01`.

## Obrigatório

- A aprovação de pagamento é centralizada em `src/lib/payments.js:applyPaymentApproval`, consumida
  por `api/webhooks/efi/route.js` e por `api/payments/status/route.js` — qualquer alteração na regra
  de aprovação vai nesse módulo, nunca duplicada nos dois pontos de chamada.
- Gateway atual: **Efí** (API Pix real, ver `docs/EFI_SETUP.md` e `src/lib/efi.js`). O Mercado Pago
  foi removido após dois bloqueios de conta — não reintroduzir sem decisão explícita do usuário.
- Webhook sempre responde `200`, mesmo em erro, para não gerar retentativa infinita.
- Efeito colateral (WhatsApp, e-mail) sempre isolado em `try/catch` próprio — falha de notificação
  nunca pode impedir a gravação da aprovação.
- Escrita de flag de idempotência (`*Sent`, `*Sending`) deve usar `runTransaction`. Ler-e-depois-escrever
  com `getDoc` + `updateDoc` é uma condição de corrida; webhook e polling rodam em paralelo.
- Pagamento do add-on de vídeo altera **apenas** `hasVideoAccess`/`videoAddonPaid`. Nunca `paymentStatus`.

## Checagem antes do commit

- [ ] Nenhum valor monetário novo veio do corpo da requisição
- [ ] O produto continua bloqueado com `?status=success` em pedido não pago
- [ ] Webhook duplicado não gera segunda mensagem de WhatsApp
