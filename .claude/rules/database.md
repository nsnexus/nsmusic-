---
description: Firestore — schema, queries e consistência
globs:
  - "src/lib/db.js"
  - "src/lib/firebase*.js"
  - "src/app/api/orders/**"
---

# Banco de dados (Firestore)

Coleções: `orders` (pedido + PII + estado de pagamento e produção) e `suno_tasks`
(`{ status, result, orderId, updatedAt }`). Schema é implícito — o mais próximo de uma definição está
em `src/app/api/orders/create/route.js:POST`.

## Queries

- Proibido `getDocs(collection(...))` sem `where` e sem `limit`. Varredura completa custa uma leitura
  por documento e cresce com a base. Já existem 3 ocorrências catalogadas (M-03).
- Filtragem deve acontecer no Firestore, nunca no cliente depois de baixar a coleção.
- Listagem para humano precisa de paginação.
- Campo novo usado em `where` precisa de índice declarado em `firestore.indexes.json`.

## Escrita

- Datas sempre `new Date().toISOString()`. Ao ler, tratar os dois formatos (`Timestamp.toDate()` e string).
- `setDoc` sempre com `{ merge: true }`, salvo quando a substituição total for intencional e comentada.
- Ler-modificar-escrever precisa de `runTransaction`. Especialmente flags de idempotência.
- Não gravar blob/base64 dentro do documento — limite de 1 MiB. Use Firebase Storage e guarde a URL.
- Exclusão de pedido deve ser lógica (`deletedAt`) e remover as `suno_tasks` relacionadas.

## Valores de `paymentStatus`

Em uso hoje: `AGUARDANDO_PAGAMENTO` (criação), `PAGAMENTO_APROVADO` (servidor), `PAGO` (cliente).
Ao ler, aceitar `PAGAMENTO_APROVADO` **e** `PAGO`. Ao escrever, use apenas `PAGAMENTO_APROVADO`.
Não introduzir um quinto valor.

## Checagem antes do commit

- [ ] Nenhum `getDocs` novo sem filtro
- [ ] Índice declarado para todo campo novo em `where`
- [ ] Data gravada como string ISO
