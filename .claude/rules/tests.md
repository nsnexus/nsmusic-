---
description: Verificação de qualidade — o que existe e o que fazer enquanto não existe suíte
globs:
  - "**"
---

# Testes e qualidade

## Estado atual (atualizado após os Lotes 0-8 do FIX_PLAN)

O projeto tem testes automatizados (Vitest, `tests/unit/`, ~88 testes), `typecheck` (`tsc --noEmit`,
opcional/informativo — o projeto continua em JavaScript puro) e CI (`.github/workflows/ci.yml`, roda
lint + typecheck + test + build em todo push/PR para `master`). `.eslintrc.json` existe e `next lint`
está configurado. Scripts disponíveis: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.

Cobertura já existente: `applyPaymentApproval` (webhook duplicado, fora de ordem, estorno, valor
divergente do catálogo, add-on isolado), `requireAdmin` (token ausente/inválido/sem permissão/admin,
custom claim), `extractAudioTracks`, `generatePixPayload` (incluindo `txid`), formatação de telefone,
`isBlockedByFreeLimit`, `generateUniqueOrderNumber`, templates de WhatsApp, `updateTaskResult`
(idempotência de envio). Antes de assumir que uma função não tem teste, rode `npm test` e confira
`tests/unit/` — é mais rápido que reescrever.

## Verificação mínima obrigatória

1. `npm run build`, `npm run lint`, `npm run typecheck` e `npm test` precisam passar. Se
   `node_modules` estiver quebrado, `npm ci` antes.
2. Percorrer manualmente o fluxo afetado quando possível. Para mudanças em pagamento, o caminho
   completo: criar → letra → música → checkout → `/entrega`. **Nenhum agente desta sessão teve
   acesso a um navegador real com credenciais Firebase reais** — sempre diga explicitamente se essa
   verificação visual não foi feita, mesmo que o build/testes tenham passado.
3. Conferir o documento no Firestore após operações de escrita (quando houver acesso a um ambiente real).

## Ao adicionar testes

- Antes de refatorar, escreva teste de **caracterização**: fixe o comportamento atual, não o desejado.
- Firestore é mockado por reimplementação mínima de `doc/getDoc/updateDoc/runTransaction` sobre um
  objeto `store` em memória (ver `tests/unit/payments.test.js` para o padrão) — não usar uma lib de
  mock que aceite escritas que as regras reais recusariam.
- Módulos que importam `@cloudflare/next-on-pages` são resolvidos via `tests/stubs/next-on-pages.js`
  (configurado em `vitest.config.mjs`) — não precisa mockar de novo por arquivo de teste.

## Nunca

- Marcar como verificado o que não foi executado. Se o build não rodou, diga que não rodou.
- Testar contra pedidos reais de clientes em produção.
