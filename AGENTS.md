# NS Music

Plataforma de músicas personalizadas por IA. O cliente conta a história de um homenageado, a IA escreve
a letra, a Suno grava o áudio, o cliente ouve a prévia e paga PIX (R$ 9,99) para liberar os MP3.
Add-on de vídeo slideshow: + R$ 6,90.

## Stack

Next.js 14 App Router · JavaScript puro (sem TypeScript) · React 18 · npm
Cloudflare Pages **Edge Runtime** (`@cloudflare/next-on-pages`) · Firebase Firestore + Storage
Integrações: Kie.ai/Suno (música) · OpenAI→Gemini (letra) · Mercado Pago (PIX) · W-API (WhatsApp)

## Arquitetura em uma frase

App monolítico Edge-only que acessa o Firestore com o **SDK cliente** tanto no browser quanto nas
rotas de API — não existe Firebase Admin SDK, portanto **as rotas de API não têm privilégio nenhum**
sobre o banco. Detalhes: `docs/ARCHITECTURE.md`.

## Comandos

```bash
npm ci          # restaurar dependências (node_modules costuma quebrar neste repo)
npm run dev     # desenvolvimento
npm run build   # DEVE passar antes de qualquer commit
npm run lint
```

Não existem `test` nem `typecheck`. Deploy é **automático no push para `master`** (Cloudflare Pages) —
todo merge vai direto a produção.

## Estrutura

```
src/app/            páginas (/criar, /entrega, /admin, /homenagem, /acompanhar, /minhas-musicas)
src/app/api/        15 route handlers, todos `runtime = 'edge'`
src/lib/            db.js · firebase.js · firebase-edge.js · gemini.js · whatsapp.js · videoGenerator.js
docs/               CODEBASE_MAP.md (índice) · ARCHITECTURE.md · audit/
.Codex/rules/      regras por área, com escopo de caminho
```

## Convenções

- Estilo: **CSS inline** (`style={{}}`) + classes de `globals.css`. **Nunca Tailwind.**
- Datas: sempre `new Date().toISOString()` (string), nunca `Timestamp` nativo.
- Imports do Firebase sempre modulares. Em rotas Edge, usar `firebase/firestore/lite` via `@/lib/firebase-edge`.
- Toda rota em `src/app/api/` precisa de `export const runtime = 'edge'`.
- Nunca `export const runtime` em arquivo com `'use client'`.
- Português nas mensagens de UI e de erro.

## Regras obrigatórias

1. **Nunca hardcodar segredo**, nem como fallback (`process.env.X || 'valor'`). Já aconteceu — ver C-06.
2. **Nunca confiar no cliente** para preço, status de pagamento ou identidade de admin.
3. Não liberar recurso pago sem confirmação do provedor de pagamento verificada no servidor.
4. Não logar PII (telefone, e-mail, CPF) nem material de token.
5. Comparar valores monetários com tolerância (`Math.abs(a - b) < 0.01`), nunca `===`.
6. Documentar toda variável de ambiente nova em `.env.example`.
7. Alterações pequenas e rastreáveis; não mudar regra de negócio sem evidência.

## Áreas críticas — leia `docs/audit/AUDIT_REPORT.md` antes de tocar

O sistema tem **11 vulnerabilidades críticas abertas**, concentradas em pagamento e autorização.
Não existe autenticação de servidor em nenhuma rota de API. Ao mexer nessas áreas, verifique se está
corrigindo ou agravando um item já catalogado.

- Pagamento: `api/payments/*`, `api/webhooks/mercadopago`, `entrega/page.jsx:69`
- Autorização: todas as rotas de `api/orders/*`, páginas de `admin/`
- Geração: `api/suno/*`, `src/lib/db.js`

## Fluxo de pagamento (resumido)

Preço calculado no **cliente** (`criar/page.jsx:getTotalPrice`) → `POST /api/payments/create` gera um
BR Code PIX **estático** (sem `txid`) → o cliente faz polling em `GET /api/payments/status` → a
aprovação real é gravada por `webhooks/mercadopago:processPayment` **ou** por
`payments/status:markOrderApproved` (lógica duplicada nos dois arquivos — alterar sempre os dois).

`paymentStatus` hoje tem 4 valores em uso: `AGUARDANDO_PAGAMENTO`, `PAGAMENTO_APROVADO`, `PAGO`,
e `PENDENTE` (documentado mas nunca escrito). Trate `PAGAMENTO_APROVADO` e `PAGO` como equivalentes.

## Fluxo de geração (resumido)

`/criar` → `POST /api/lyrics/generate` → usuário aprova a letra → `POST /api/orders/create` →
`POST /api/suno/generate` → o resultado chega por **duas vias concorrentes** (webhook
`/api/suno/webhook` e polling `/api/suno/status`), ambas convergindo em `src/lib/db.js:updateTaskResult`,
que também dispara o WhatsApp. **A música é gerada antes do pagamento.**

## Como testar

Não há suíte automatizada. O mínimo aceitável hoje:
1. `npm run build` verde.
2. Percorrer manualmente o caminho crítico: criar → gerar letra → gerar música → checkout → `/entrega`.
3. Mudanças em pagamento: verificar o pedido no Firestore e no painel `/admin` após cada transição.
4. Nunca testar contra pedidos reais de clientes — criar um pedido próprio.

## Documentação

| Preciso de… | Leia |
|---|---|
| Achar um arquivo ou símbolo | `docs/CODEBASE_MAP.md` |
| Entender como as peças conversam | `docs/ARCHITECTURE.md` |
| Saber se um problema já é conhecido | `docs/audit/AUDIT_REPORT.md` |
| Ordem segura para corrigir | `docs/audit/FIX_PLAN.md` |
| Regras da área que estou tocando | `.Codex/rules/*.md` |

`.agents/AGENTS.md` é o rulebook legado — ainda útil como registro da intenção original do projeto,
mas `.Codex/rules/` tem precedência quando houver conflito.

## Ao compactar o contexto, preserve

- Arquivos alterados nesta sessão e o motivo de cada alteração.
- Erros ainda **não** corrigidos e hipóteses já descartadas.
- Resultados de `npm run build` / testes (o que passou e o que falhou, com a mensagem).
- Decisões arquiteturais tomadas e as alternativas rejeitadas.
- Próximos passos acordados e o lote do `FIX_PLAN.md` em andamento.
