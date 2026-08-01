---
description: Verificação de qualidade — o que existe e o que fazer enquanto não existe suíte
globs:
  - "**"
---

# Testes e qualidade

## Estado atual

O projeto não tem testes automatizados, nem `typecheck`, nem CI. `package.json` expõe apenas
`dev`, `build`, `start` e `lint` — e não há `.eslintrc*` no repositório, então `next lint` nunca foi
configurado de fato.

**Não invente comandos.** Se precisar de `npm test`, crie a infraestrutura primeiro (Lote 0 do
`docs/audit/FIX_PLAN.md`) em vez de assumir que ela existe.

## Verificação mínima obrigatória

1. `npm run build` precisa passar. Se `node_modules` estiver quebrado, `npm ci` antes.
2. Percorrer manualmente o fluxo afetado. Para mudanças em pagamento, o caminho completo:
   criar → letra → música → checkout → `/entrega`.
3. Conferir o documento no Firestore após operações de escrita.

## Ao adicionar testes

- Antes de refatorar, escreva teste de **caracterização**: fixe o comportamento atual, não o desejado.
- Prioridade de cobertura, nesta ordem: aprovação de pagamento → autorização de rota →
  `extractAudioTracks` → `generatePixPayload` → formatação de telefone.
- Teste de pagamento precisa cobrir: webhook duplicado, webhook fora de ordem, estorno,
  valor divergente do catálogo, e pagamento de add-on em pedido não pago.
- Não mocar o Firestore de forma que o mock aceite escritas que as regras reais recusariam.

## Nunca

- Marcar como verificado o que não foi executado. Se o build não rodou, diga que não rodou.
- Testar contra pedidos reais de clientes em produção.
