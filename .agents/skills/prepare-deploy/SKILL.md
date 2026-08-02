---
name: prepare-deploy
description: Checklist antes de fazer push para master no NS Music, onde o deploy é automático e vai direto a produção. Use quando pedirem para commitar, fazer push, publicar ou "subir" uma alteração.
---

# Preparar deploy

**`git push origin master` publica em produção imediatamente** (Cloudflare Pages, webhook do GitHub).
Não há ambiente de staging e não há rollback automático. Trate todo push como uma liberação.

## Antes do push

1. Rodar a skill `run-quality-checks`. Build vermelho = não sobe.
2. `git diff --stat origin/master` — revisar o que realmente está indo.
3. Confirmar que nenhuma variável de ambiente nova é necessária. Se for:
   - documentar em `.env.example` (só o nome, nunca o valor);
   - **configurar no painel do Cloudflare Pages antes do push**, senão a rota quebra em produção.
   - Lembre que o código lê `getRequestContext().env.NOME` com fallback para `process.env.NOME`.
4. Se a mudança toca pagamento ou autorização, rodar a skill `review-payment-flow` primeiro.
5. Verificar que nenhuma rota nova em `src/app/api/` ficou sem `export const runtime = 'edge'`.
6. Verificar que nenhum arquivo com `'use client'` ganhou `export const runtime`.

## Mensagem de commit

Português, imperativo, com prefixo (`fix:`, `feat:`, `chore:`). Uma linha dizendo **o impacto**, não
só o arquivo alterado.

## Depois do push

Confirmar o build no painel do Cloudflare Pages e abrir o caminho crítico em produção
(`/criar` e `/entrega?orderId=<pedido de teste>`). Se quebrou, `git revert` e push — é mais rápido e
mais seguro que corrigir para frente.

## Nunca

- Push com build quebrado "porque o Cloudflare compila diferente".
- Push de alteração em pagamento sem ter percorrido o fluxo manualmente.
- `--no-verify` ou `--force` nesta branch.
