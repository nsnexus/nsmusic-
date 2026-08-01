---
name: update-codebase-map
description: Atualiza docs/CODEBASE_MAP.md e docs/ARCHITECTURE.md quando a estrutura do NS Music muda de verdade — rota nova, coleção nova, integração nova ou fluxo alterado. Use após adicionar ou remover rotas, páginas, libs ou serviços externos.
---

# Atualizar o mapa da base de código

## Quando usar

Só quando houver **mudança estrutural real**:

- rota criada, removida ou renomeada em `src/app/api/` ou `src/app/`;
- coleção ou campo estrutural novo no Firestore;
- integração externa adicionada ou removida;
- alteração no fluxo de pagamento ou de geração;
- módulo novo em `src/lib/`.

**Não use** para correção de bug, ajuste de estilo, mudança de texto ou refatoração interna que não
altera o mapa. Documento que muda a cada commit deixa de ser confiável.

## Como detectar o que mudou

```bash
git diff --name-status <ref-anterior>..HEAD -- src/
ls src/app/api/*/route.js src/app/api/*/*/route.js
grep -rn "export const runtime" src/app/api/
```

Compare com as tabelas de `docs/CODEBASE_MAP.md`. Atualize **apenas as linhas afetadas**.

## Regras de edição

- `CODEBASE_MAP.md` é índice: caminho, símbolo e uma frase. Nunca código, nunca listagem exaustiva.
- Referência sempre no formato `caminho/arquivo.js:NomeDoSimbolo`.
- Número de linha só para pontos críticos que alguém precisa achar rápido — eles envelhecem.
- `ARCHITECTURE.md` só muda se a **forma** do sistema mudou (nova camada, novo limite de confiança,
  nova decisão). Rota nova dentro do padrão existente não é mudança arquitetural.
- Se um item de `docs/audit/AUDIT_REPORT.md` foi corrigido, marque-o lá como resolvido — não apague
  o histórico da descoberta.

## Saída

Diff resumido do que foi atualizado, em no máximo 10 linhas. Se nada estrutural mudou, diga isso e
não edite nada.
