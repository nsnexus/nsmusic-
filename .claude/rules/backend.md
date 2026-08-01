---
description: Route handlers Edge em src/app/api
globs:
  - "src/app/api/**"
---

# Backend / rotas de API

## Runtime

- Toda rota precisa de `export const runtime = 'edge'`.
- Nada de API exclusiva de Node.js (`fs`, `crypto` nativo, `Buffer` sem polyfill, Firebase Admin).
- Firestore em rota Edge: usar `dbEdge` de `@/lib/firebase-edge` (`firebase/firestore/lite`).
  Importar `@/lib/firebase` ou `firebase/firestore` numa rota Edge quebra o build do Cloudflare.
- Segredos: tentar `getRequestContext().env.NOME` primeiro, com fallback para `process.env.NOME`.
  O `getRequestContext()` precisa estar em `try/catch` — ele lança fora do runtime da Cloudflare.

## Contrato

- Validar todos os campos obrigatórios antes de qualquer I/O; retornar `400` com `{ error: "..." }`.
- Resposta de erro sempre `{ error: string }`. Sucesso sempre inclui os campos que o chamador espera.
- Nunca aceitar do corpo um campo que represente decisão de negócio (preço, status, permissão).
- `fetch` a serviço externo precisa de timeout (`AbortSignal.timeout(...)`).
- Operação que pode ser reexecutada (webhook, callback) precisa ser idempotente.

## Erros

- `catch` vazio é proibido. No mínimo `console.warn` com contexto — mas nunca com PII.
- Falha silenciosa que devolve `200` esconde incidente. Se a operação não aconteceu, diga.

## Checagem antes do commit

- [ ] `export const runtime = 'edge'` presente
- [ ] Nenhum import de `@/lib/firebase` (versão não-lite) na rota
- [ ] Todo campo do corpo validado antes do uso
