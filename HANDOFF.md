# NS Music — Handoff da auditoria e correções (2026-08-01/02)

> Checkpoint gerado após executar os 9 lotes de `docs/audit/FIX_PLAN.md`. Branch
> `correcoes-auditoria`, 10 commits locais, **nada enviado (push) e nenhum deploy realizado**.
> Referências completas: [docs/audit/AUDIT_REPORT.md](docs/audit/AUDIT_REPORT.md) e
> [docs/audit/FIX_PLAN.md](docs/audit/FIX_PLAN.md) (status real, item por item).

## Estado do repositório neste checkpoint

- `git status`: working tree limpo (só os arquivos auto-gerados de compatibilidade entre
  ferramentas — `.codex/`, `.agents/skills/*`, `AGENTS.md` — que não são deste trabalho e não
  foram tocados nem commitados).
- `git diff`: vazio (tudo já commitado nos 10 commits do lote).
- Verificação executada agora: `npm run build` ✅ · `npm run lint` ✅ (só warnings pré-existentes de
  `<img>`) · `npm run typecheck` ✅ · `npm test` ✅ **88/88 testes**.
- **Nada foi testado em navegador real** nem contra Firebase/Mercado Pago/Kie.ai reais — só
  build, lint, typecheck e testes unitários com mocks.

## 1. Arquitetura atual

Next.js 14 (App Router), JavaScript puro, rodando 100% no Edge da Cloudflare Pages
(`@cloudflare/next-on-pages`). Firestore acessado com o SDK **client** (nunca Admin SDK) tanto no
browser quanto nas rotas Edge — essa continua sendo a limitação estrutural central: não existe
identidade privilegiada de servidor ao nível do banco.

O que mudou desde a auditoria original: a autorização de admin e as regras de preço/pagamento agora
são decididas **nas rotas de API** (não mais no browser), mesmo sem uma identidade de serviço no
Firestore. `firestore.rules` existe como rascunho versionado mas **não publicado** — publicá-lo hoje
quebraria as próprias rotas de API, que ainda leem/escrevem no Firestore com a mesma identidade
anônima do browser (ver os 3 pré-requisitos documentados dentro do próprio arquivo `firestore.rules`).

Módulos centrais criados nesta rodada:

| Módulo | Responsabilidade |
|---|---|
| `src/lib/pricing.js` | Catálogo de preço por SKU — fonte única de valor |
| `src/lib/payments.js` | `applyPaymentApproval` — único ponto de aprovação de pagamento, com `runTransaction` para idempotência |
| `src/lib/auth.js` | `requireAdmin()` — verifica ID token do Firebase + custom claim/allowlist |
| `src/lib/proxyAllowlist.js` | Domínios permitidos nos proxies de mídia |
| `src/lib/whatsappTemplates.js` | Templates de mensagem (único lugar, sem dependência de Cloudflare) |
| `src/lib/authErrors.js`, `src/lib/sunoPayload.js` | Utilitários extraídos de duplicação |

Detalhe completo e diagramas: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) e
[docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md) (ambos reescritos nesta rodada).

## 2. Arquivos alterados (visão geral — 79 arquivos, +7840/-2925 linhas em 10 commits)

**Novos:**
`src/lib/{auth,payments,pricing,proxyAllowlist,whatsappTemplates,authErrors,sunoPayload}.js`,
`firestore.rules` (rascunho, não publicado), `firestore.indexes.json`,
`src/app/criar/{wizardStyles.js,wizardOptions.js,CustomAudioPreview.jsx,WizardSteps.jsx}`,
`src/app/entrega/entregaStyles.js`, `.github/workflows/ci.yml`, `.eslintrc.json`, `tsconfig.json`,
`vitest.config.mjs`, `tests/unit/*.test.js` (14 arquivos, 88 testes),
`scripts/{migrate-payment-status,revert-payment-status-migration,set-admin-claim}.mjs`.

**Removidos (código morto confirmado sem uso):**
`src/lib/sunoToken.js`, `gerar-logs-pagbank.js`, `src/app/homenagem/HomenagemPublica.jsx`,
`addonsConfig`/`packagesList` de `criar/page.jsx`, dependência npm `mercadopago`.

**Modificados (principais):** todas as rotas de `src/app/api/`, `src/app/criar/page.jsx` (2848→1788
linhas), `src/app/entrega/page.jsx` (1443→1263 linhas), `src/app/{admin,minhas-musicas,homenagem,
acompanhar}/page.jsx`, `src/lib/{db,whatsapp,gemini}.js`, `.env.example`, `.gitignore`,
`docs/{CODEBASE_MAP,ARCHITECTURE}.md`, `.claude/rules/tests.md`.

Lista arquivo-por-arquivo com o motivo de cada mudança: mensagens dos 10 commits
(`git log --oneline correcoes-auditoria` a partir de `9365976`).

## 3. Decisões tomadas

- **Uma rodada de perguntas por lote de risco**, nunca ação silenciosa em pagamento/segurança
  (rotação da chave Kie.ai, publicação de `firestore.rules`, mecanismo de admin interino, rate
  limiting, decomposição de arquivos grandes) — todas as respostas do usuário estão refletidas no
  código e documentadas em `docs/audit/FIX_PLAN.md`.
- **Nenhuma migration de dados foi executada** — só preparadas (`scripts/*.mjs`), por exigirem
  credenciais reais do Firebase Admin SDK inexistentes nesta sessão.
- **`firestore.rules` ficou como rascunho não publicado** — publicar exigiria antes uma identidade
  de servidor (Admin SDK ou service account), que a arquitetura Edge-only atual não tem.
- **Dependências**: só patch/minor sem breaking change (`firebase` 10.12→10.14, remoção de
  `mercadopago`); `firebase` v11 (fecharia as 12 vulnerabilidades restantes) **não foi feito** por
  ser major bump com risco de incompatibilidade.
- **Rate limiting (A-04/A-12)**: por decisão do usuário, só documentada a recomendação (Cloudflare
  Rate Limiting Rules no painel), sem código.
- **Decomposição de `criar/page.jsx`/`entrega/page.jsx` (M-20)**: feita parcialmente e por decisão
  consciente — só as partes de baixo risco (estilos, opções estáticas, passos 1-9 do wizard,
  puramente apresentacionais). Os trechos de checkout/pagamento/polling do Suno foram deixados
  intactos nos arquivos principais porque decompô-los sem poder testar visualmente (sem navegador
  real disponível nesta sessão) tinha risco desproporcional ao ganho de organização.

## 4. Bugs corrigidos

- M-10 (poller do Suno sem cleanup, sobrevivia à desmontagem por até 6 min)
- M-11 (avaliação do cliente nunca era persistida, só simulava sucesso)
- M-12 (botão "Tentar Novamente" enviava payload diferente do original, perdendo musicMood/voiceType)
- M-13 (checkbox de aceite dos termos era `true` fixo no código, sem UI real)
- M-15 (verificação de WhatsApp falhava "aberta" — erro de rede virava número válido)
- M-16 (busca por telefone cruzava clientes por substring bidirecional)
- M-17 (link "Entrega Privada" de demonstração exposto a todos os clientes)
- M-02 (`orderNumber` com só 90.000 combinações possíveis, sem checar unicidade)
- M-06 (inconsistência de `merge` no Firestore + corrida de leitura-depois-escrita no envio de
  WhatsApp de `updateTaskResult`, mesma classe do A-09)
- M-07 (pedidos excluídos apagavam o documento de vez; `suno_tasks` ficavam órfãs)
- M-08 (capa da música salva como base64 no Firestore e no `localStorage`)
- M-09 (painel admin sem paginação, lia a coleção inteira)
- **Regressão introduzida e corrigida na própria sessão**: a notificação de "nova venda" ao admin
  via WhatsApp tinha sumido ao unificar a lógica de aprovação de pagamento no Lote 2 — encontrada e
  restaurada no Lote 7 (com o número agora vindo de `ADMIN_WHATSAPP`, não mais hardcoded).

## 5. Bugs pendentes (fora do escopo resolvido, ou aguardando decisão/config externa)

- **M-21** — 12 vulnerabilidades de dependência (`undici`, via `@firebase/*`) só fecham com
  `firebase` v11 (major bump não autorizado).
- **A-04/A-12** — sem rate limiting em nenhuma rota (`suno/generate`, `lyrics/*`, `whatsapp/verify`)
  por decisão do usuário; recomendação documentada, sem implementação em código.
- **M-20 parcial** — passos 10+ do wizard de `/criar` (revisão de letra, geração de áudio com
  polling, checkout/PIX) e a maior parte de `entrega/page.jsx` (upload de vídeo, polling de
  pagamento) continuam em arquivos de 1200-1800 linhas.
- **`admin/pedidos/[id]/page.jsx`** ainda grava `paymentStatus` direto no Firestore a partir do
  browser (só o painel admin, autenticado por Firebase Auth client-side — não um visitante anônimo,
  mas ainda sem verificação de servidor nesse ponto específico).
- **C-11 / `firestore.rules`** — rascunho criado, mas **não publicado** no Firebase; conteúdo real
  das regras em produção continua desconhecido (nunca confirmado por acesso ao console).
- **Migrações não executadas**: `PAGO`→`PAGAMENTO_APROVADO` em pedidos antigos (script pronto) e
  custom claim `admin:true` (script pronto, precisa de Admin SDK).
- **Segredos novos não configurados em produção**: `KIE_WEBHOOK_SECRET`,
  `MERCADO_PAGO_WEBHOOK_SECRET`, `ADMIN_WHATSAPP` — o código já suporta e degrada com segurança
  (pula a checagem/notificação com aviso) se ausentes, mas a proteção adicional só entra em vigor
  quando configurados.
- **Nenhum teste E2E/visual** — só testes unitários com Firestore/fetch mockados.

## 6. Próximos passos, em ordem de prioridade

1. **Validar manualmente em navegador real** (com credenciais reais em `.env.local`, nunca
   commitadas): fluxo completo criar → letra → música → checkout → `/entrega`, painel admin,
   `/entrega?orderId=X&status=success` num pedido não pago (deve continuar bloqueado).
2. **Configurar os 3 segredos novos** no Cloudflare Pages (`KIE_WEBHOOK_SECRET`,
   `MERCADO_PAGO_WEBHOOK_SECRET`, `ADMIN_WHATSAPP`) e atualizar a URL de callback registrada na
   Kie.ai para incluir `?secret=`.
3. **Rodar `scripts/set-admin-claim.mjs`** com uma service account real, depois
   `scripts/migrate-payment-status.mjs` (dry-run primeiro, sem `--apply`).
4. **Decidir sobre `firestore.rules`**: resolver o pré-requisito de identidade de servidor (custom
   claim já suportado; falta a identidade de "serviço" para as rotas de API) antes de publicar.
5. **Configurar Cloudflare Rate Limiting Rules** para `suno/generate`, `lyrics/*`, `whatsapp/verify`.
6. **Migrar `admin/pedidos/[id]/page.jsx`** para escrever via API autenticada em vez de Firestore direto.
7. **Avaliar `firebase` v11** numa janela dedicada, com testes de regressão.
8. **Terminar a decomposição de `criar/page.jsx`/`entrega/page.jsx`** com ambiente de teste visual disponível.
9. Revisar os 10 commits (`git log --oneline correcoes-auditoria`) e decidir sobre push/PR para `master`
   — lembrando que push para `master` dispara deploy automático no Cloudflare Pages.
