# NS Music — Mapa da Base de Código

> Índice de navegação. Não contém código. Use-o para localizar o arquivo certo **antes** de abrir qualquer coisa.
> Arquitetura e diagramas: [ARCHITECTURE.md](ARCHITECTURE.md). Problemas conhecidos: [audit/AUDIT_REPORT.md](audit/AUDIT_REPORT.md).
> Atualizado em 2026-08 após os Lotes 0-8 do [audit/FIX_PLAN.md](audit/FIX_PLAN.md).

## Visão geral

Plataforma de **músicas personalizadas geradas por IA**. O cliente preenche um wizard com a história do
homenageado, a IA escreve a letra, a Suno (via Kie.ai) grava o áudio, o cliente ouve uma prévia e paga
PIX (R$ 9,99) para liberar os MP3 completos. Add-on de vídeo slideshow por + R$ 6,90.

- **Stack**: Next.js 14 (App Router) · JavaScript puro (sem TypeScript) · React 18
- **Runtime**: Cloudflare Pages Edge (`@cloudflare/next-on-pages`) — todas as rotas API são `runtime = 'edge'`
- **Banco**: Firebase Firestore (SDK **client**, não Admin) — coleções `orders`, `suno_tasks`
- **Storage**: Firebase Storage (fotos do vídeo homenagem, capa personalizada)
- **Pacotes**: npm (`package-lock.json`) · Node 24 local
- **Testes**: Vitest (`tests/unit/`, 88 testes) · **CI**: GitHub Actions (`.github/workflows/ci.yml`)

## Diretórios

| Caminho | Conteúdo |
|---|---|
| `src/app/` | Páginas (App Router) + rotas de API |
| `src/app/api/` | 15 Route Handlers, todos Edge |
| `src/app/criar/` | Wizard principal — decomposto em vários arquivos (ver abaixo) |
| `src/lib/` | Integrações, acesso a dados e regras de negócio compartilhadas |
| `src/components/` | Componentes compartilhados |
| `public/` | Áudios de demo, capas, logo |
| `tests/unit/` | Testes Vitest — utilitários puros e módulos com Firestore/fetch mockados |
| `scripts/` | Scripts operacionais manuais (migração de dados, custom claim de admin) — nunca rodam automaticamente |
| `workers/efi-proxy/` | Worker Cloudflare separado (deploy próprio via `npm run deploy:efi-proxy`), só para o hop mTLS até a Efí — Cloudflare Pages não suporta binding de certificado mTLS (ver `docs/EFI_SETUP.md`) |
| `.agents/` | Rulebook legado do projeto (`AGENTS.md`) — ainda é fonte de intenção original |
| `.claude/rules/` | Regras por área (tem precedência sobre `.agents/` em caso de conflito) |

## `src/app/criar/` — arquivos do wizard (M-20 no FIX_PLAN, Lote 7)

`page.jsx` (1.788 linhas, era 2.848) mantém todo o estado e os handlers; os arquivos abaixo foram
extraídos e só recebem props — nenhuma lógica de negócio foi duplicada ou alterada:

| Arquivo | Conteúdo |
|---|---|
| `wizardStyles.js` | Objeto de estilos inline (estático) |
| `wizardOptions.js` | Arrays de opções do wizard (recipients, occasions, stylesList, moods, relationships) |
| `CustomAudioPreview.jsx` | Player de prévia de 60s (componente já autocontido) |
| `WizardSteps.jsx` | Passos 1-9 do wizard (apresentacional puro) |

Os passos 10+ (revisão de letra, geração de áudio com polling, checkout/PIX) **permanecem** em
`page.jsx` — decisão deliberada por serem a parte mais interligada com estado/efeitos (ver FIX_PLAN,
Lote 7, para o raciocínio completo).

## Páginas e rotas

| Rota | Arquivo | Acesso |
|---|---|---|
| `/` | `src/app/page.jsx` | Pública (landing) |
| `/criar` | `src/app/criar/page.jsx` + arquivos acima | Pública — wizard principal |
| `/entrega` | `src/app/entrega/page.jsx` (1.263 linhas, era 1.443) | Pública por `?orderId=` — liberação do produto, gate por `paymentStatus` do Firestore (C-01 corrigido) |
| `/acompanhar` | `src/app/acompanhar/page.jsx` | Pública por `?orderId=` |
| `/homenagem` | `src/app/homenagem/page.jsx` | Pública por `?orderId=` — gate por `paymentStatus` (C-07 corrigido) |
| `/minhas-musicas` | `src/app/minhas-musicas/page.jsx` | Firebase Auth (cliente) ou busca por telefone/e-mail (`where` exato, não mais varredura completa — C-08) |
| `/login` | `src/app/login/page.jsx` | Pública |
| `/admin` | `src/app/admin/page.jsx` | Firebase Auth + checagem de e-mail no browser (só UX — autorização real é no servidor desde o Lote 1); listagem paginada (M-09) |
| `/admin/login` | `src/app/admin/login/page.jsx` | Pública |
| `/admin/pedidos/[id]` | `src/app/admin/pedidos/[id]/page.jsx` | Idem `/admin` |
| `/termos-de-uso`, `/politica-de-privacidade` | idem | Públicas, estáticas |

## APIs (`src/app/api/`)

Autorização de admin via `src/lib/auth.js:requireAdmin()` (ID token do Firebase verificado no
servidor via Identity Toolkit + allowlist `ADMIN_EMAILS` ou custom claim `admin:true`). Rotas
públicas (usadas pelo próprio cliente durante a criação) não exigem token — ver `audit/AUDIT_REPORT.md`
para o que ainda depende de rate limiting externo (A-04/A-12, não implementado em código).

| Endpoint | Arquivo:símbolo | Função | Auth |
|---|---|---|---|
| `POST /api/orders/create` | `orders/create/route.js:POST` | Cria pedido; valida termos aceitos e limite de prévias grátis (A-11) | Pública |
| `POST /api/orders/update` | `orders/update/route.js:POST` | Atualiza `paymentStatus`/`audioUrl`/`productionStatus` | Admin |
| `POST /api/orders/delete` | `orders/delete/route.js:POST` | Exclusão lógica (`deletedAt`) + remove `suno_tasks` associadas (M-07) | Admin |
| `GET /api/orders/search` | `orders/search/route.js:GET` | Busca por `orderId` (exata) ou substring em nome/homenageado (limitada aos 300 mais recentes) | Admin |
| `POST /api/payments/create` | `payments/create/route.js` | Deriva o valor do catálogo (`src/lib/pricing.js`) por `sku`; cria cobrança real na Efí (`src/lib/efi.js:createPixCharge`); persiste `paymentIntentId` (txid)/`expectedAmount`/`paymentIntentSku` | Pública |
| `GET /api/payments/status` | `payments/status/route.js` | Consulta a Efí (`getChargeStatus`) e chama `src/lib/payments.js:applyPaymentApproval` | Pública |
| `POST /api/webhooks/efi` | `webhooks/efi/route.js` | Segredo `?secret=` (se configurado) + reconsulta `getChargeStatus` antes de aprovar; chama `applyPaymentApproval` | Segredo na URL |
| `POST /api/suno/generate` | `suno/generate/route.js:POST` | Fino: valida corpo e delega a `src/lib/suno.js:requestSunoGeneration`; inclui segredo no callback (A-03) | Pública |
| `GET /api/suno/status` | `suno/status/route.js:GET` | Polling do status; `orderId` sempre vem do `suno_tasks`, nunca da query (A-02); em falha definitiva da Kie.ai, tenta `src/lib/suno.js:maybeAutoRetrySunoFailure` antes de admitir erro ao cliente | Pública |
| `POST /api/suno/webhook` | `suno/webhook/route.js:POST` | Callback da Kie.ai; exige `?secret=` se `KIE_WEBHOOK_SECRET` configurado | Segredo compartilhado |
| `POST /api/orders/reconcile` | `orders/reconcile/route.js:POST` | Terceira via de convergência (webhook/polling do cliente + esta): recupera música pronta e pagamento confirmado que ficaram presos porque o cliente fechou a aba; retenta geração automaticamente via `src/lib/suno.js`. Acionável pelo painel ou por cron no Worker `efi-proxy` | Admin ou segredo (`RECONCILE_SECRET`) |
| `POST /api/lyrics/generate` | `lyrics/generate/route.js:POST` | Compõe a letra | Pública |
| `POST /api/lyrics/improve` | `lyrics/improve/route.js:POST` | Ajusta a letra | Pública |
| `POST /api/video/generate` | `video/generate/route.js:POST` | Registra fotos do slideshow; exige `hasVideoAccess` (A-07) | Pública (gate por acesso pago) |
| `POST /api/whatsapp/send` | `whatsapp/send/route.js:POST` | Reenvio manual pelo admin | Admin |
| `POST /api/whatsapp/{notify,verify}` | `whatsapp/*/route.js:POST` | Notificação automática e verificação de número | Pública |
| `GET /api/audio/proxy`, `GET /api/image-proxy` | `audio/proxy`, `image-proxy` | Proxies de mídia — só domínios da allowlist (`src/lib/proxyAllowlist.js`, A-05/A-06) | Pública |

## `src/lib/` — módulos compartilhados

| Arquivo | Responsabilidade |
|---|---|
| `db.js` | `saveTask`/`updateTaskResult`/`extractAudioTracks`/`getTask` — resultado da Suno, com `runTransaction` para o envio de WhatsApp (M-06) |
| `payments.js` | `applyPaymentApproval` — único ponto de aprovação de pagamento (M-18), com idempotência via `runTransaction` (A-09) |
| `efi.js` | Cliente da API Pix da Efí (`createPixCharge`, `getChargeStatus`) — toda chamada exige mTLS (ver `docs/EFI_SETUP.md`) |
| `httpRetry.js` | `fetchWithRetry` — retry com backoff, compartilhado entre webhook e polling de pagamento (B-08) |
| `pricing.js` | Catálogo de preços por SKU (`audio_only`, `combo`, `video_addon`) — fonte única de valor (C-05) |
| `auth.js` | `requireAdmin()` — verificação de ID token + custom claim/allowlist |
| `proxyAllowlist.js` | Domínios permitidos nos proxies de mídia |
| `whatsappTemplates.js` | Templates de mensagem do WhatsApp (M-19) — sem dependência de `@cloudflare/next-on-pages`, importável por componentes client-side |
| `whatsapp.js` | Envio/verificação via W-API; re-exporta os templates acima |
| `authErrors.js` | `getFriendlyAuthErrorMessage` (B-04) |
| `sunoPayload.js` | `buildSunoPayload` — payload de `/api/suno/generate`, reaproveitado também pela retentativa automática (M-12) |
| `suno.js` | `requestSunoGeneration` (chamada à Kie.ai + persistência, extraído de `api/suno/generate`), `maybeAutoRetrySunoFailure` (retry automático limitado — até 3 tentativas — quando a Kie.ai reporta falha definitiva, com reserva de idempotência), `resolveLatestTaskId` (segue a cadeia de `retryTaskId` até a tarefa mais recente) |
| `firebase.js` / `firebase-edge.js` | Client SDK completo (browser) / `firestore/lite` (rotas Edge) |
| `gemini.js` | `runGeminiWithFailover` — OpenAI primário, Gemini fallback |
| `videoGenerator.js` | `createSlideshowVideo` — importado dinamicamente em `entrega/page.jsx` (code splitting, Lote 6) |

`src/lib/sunoToken.js` e a raiz `gerar-logs-pagbank.js` eram código morto e foram removidos (B-07).

## Banco de dados

Firestore. `firestore.rules` e `firestore.indexes.json` **versionados no repositório**, mas
`firestore.rules` é um **rascunho não publicado** (ver C-11 no AUDIT_REPORT.md — publicar exige
antes uma identidade de servidor, que ainda não existe nesta arquitetura Edge-only sem Admin SDK).

- **`orders`** — pedido + PII do cliente + letra + URLs de áudio + estado de pagamento + `deletedAt`
  (exclusão lógica, M-07).
  Campos de pagamento: `paymentStatus` (só `AGUARDANDO_PAGAMENTO`/`PAGAMENTO_APROVADO` são escritos
  hoje; `PAGO` só existe em pedidos antigos, migração pronta em `scripts/migrate-payment-status.mjs`
  mas não executada), `paymentId`, `paidAt`, `paymentIntentId`, `paymentIntentSku`, `expectedAmount`,
  `videoPaymentId`, `hasVideoAccess`, `videoAddonPaid`.
  Campos de produção: `productionStatus`, `audioUrl`, `audioFiles`, `sunoTaskId`, `slideshowImages`,
  `videoStatus`, `coverUrl` (URL do Firebase Storage — nunca mais base64, M-08).
  Flags de notificação: `whatsappSent`/`whatsappSending`, `paymentWhatsappSent`,
  `videoPaymentWhatsappSent` (+ sufixos `Sending`/`At`).
  Consentimento: `termsAccepted`, `termsAcceptedAt` (M-13).
- **`suno_tasks`** — `{ status, result, orderId, updatedAt }`, escrito por `src/lib/db.js:saveTask` /
  `updateTaskResult` (ambos com `merge: true`, M-06).

Índices: nenhum composto declarado hoje (todas as queries são igualdade/orderBy de campo único,
indexado automaticamente pelo Firestore) — ver `firestore.indexes.json` para a justificativa e como
declarar um novo quando necessário.

## Autenticação

- **Cliente**: Firebase Auth (`signInWithEmailAndPassword`) em `src/app/login/page.jsx`, usado por `/minhas-musicas`.
- **Admin**: Firebase Auth + `src/lib/auth.js:requireAdmin()` no **servidor** (ID token verificado via
  Identity Toolkit + custom claim `admin:true` OU allowlist `ADMIN_EMAILS`). A checagem de e-mail no
  browser (`admin/login/page.jsx`, `admin/page.jsx`, `admin/pedidos/[id]/page.jsx`) continua existindo,
  mas só decide navegação/UX — a decisão de autorização real está nas rotas de API.
- **Custom claim definitivo**: `scripts/set-admin-claim.mjs` (requer Firebase Admin SDK, não executado
  ainda — pendência documentada no FIX_PLAN).

## Pagamentos

Ponto de entrada: cliente escolhe o `sku` (`audio_only`/`combo`/`video_addon`) →
`POST /api/payments/create` deriva o valor de `src/lib/pricing.js`, gera BR Code com `txid` único
(A-10) e persiste `expectedAmount`/`paymentIntentSku` no pedido → polling contra
`GET /api/payments/status`.

Confirmação real converge num único módulo: `src/lib/payments.js:applyPaymentApproval`, consumido por
`api/webhooks/efi/route.js` e `api/payments/status/route.js` (M-18). Trata também estornos/
cancelamentos, revogando acesso já concedido.

## Geração das músicas

`criar/page.jsx` → `POST /api/lyrics/generate` (`src/lib/gemini.js:runGeminiWithFailover`) →
aprovação da letra pelo usuário → `POST /api/suno/generate` (payload via
`src/lib/sunoPayload.js:buildSunoPayload`, M-12; chamada real em `src/lib/suno.js:requestSunoGeneration`)
→ Kie.ai → resultado chega por **três** vias: `POST /api/suno/webhook` (autenticado por segredo, A-03),
polling `GET /api/suno/status` (orderId nunca vem da query, A-02) e o cron de `POST /api/orders/reconcile`
para quem já fechou a aba — as três convergem em `src/lib/db.js:updateTaskResult` (que também dispara o
WhatsApp, com idempotência via `runTransaction`). Normalização das faixas: `src/lib/db.js:extractAudioTracks`.

Quando a Kie.ai reporta falha definitiva para uma tarefa (não timeout — falha real), o polling e o cron
tentam reenviar automaticamente via `src/lib/suno.js:maybeAutoRetrySunoFailure` (até 3 vezes, com reserva
de idempotência no pedido). A nova tarefa fica encadeada à antiga por `retryTaskId` em `suno_tasks`, e
`resolveLatestTaskId` segue essa cadeia — quem já estava consultando a tarefa antiga (cliente com a aba
aberta, ou o próprio cron) acaba vendo o resultado da nova sem precisar saber que ela existe.

**A geração ocorre antes do pagamento** — a cobrança acontece só para liberar o download.

## Armazenamento

- Áudios: hospedados na Kie.ai/Suno; servidos ao browser via `GET /api/audio/proxy` (allowlist de domínio).
- Fotos do vídeo e capa personalizada: Firebase Storage, upload direto do browser.
- Renderização do vídeo: no browser, via Canvas + MediaRecorder (`src/lib/videoGenerator.js`,
  importado dinamicamente em `entrega/page.jsx`).

## Painel administrativo

`src/app/admin/page.jsx` (lista paginada — `limit(pageSize+1)` + botão "Carregar mais", M-09) e
`src/app/admin/pedidos/[id]/page.jsx` (detalhe). Ações administrativas (`orders/delete`,
`whatsapp/send`) enviam `Authorization: Bearer <idToken>`.

## Integrações externas

| Serviço | Módulo | Variáveis |
|---|---|---|
| Kie.ai (Suno) | `api/suno/*` | `KIE_API_KEY`, `KIE_WEBHOOK_SECRET` |
| OpenAI | `src/lib/gemini.js` | `OPENAI_API_KEY` |
| Google Gemini | `src/lib/gemini.js` | `GEMINI_API_KEYS` (lista separada por vírgula) |
| Efí (API Pix) | `src/lib/efi.js`, `api/payments/*`, `api/webhooks/efi`, `workers/efi-proxy/` | `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY`, `EFI_ENV`, `EFI_WEBHOOK_SECRET`, `EFI_PROXY_URL`, `EFI_PROXY_SECRET` (mTLS fica no Worker `efi-proxy`, não num binding do Pages — ver `docs/EFI_SETUP.md`) |
| W-API (WhatsApp) | `src/lib/whatsapp.js` | `WAPI_INSTANCE_ID`, `WAPI_TOKEN`, `ADMIN_WHATSAPP` |
| Firebase | `src/lib/firebase.js`, `firebase-edge.js` | `NEXT_PUBLIC_FIREBASE_*` |
| Admin (allowlist interina) | `src/lib/auth.js` | `ADMIN_EMAILS` |

Ver `.env.example` para a lista completa e atualizada.

## Fluxo completo do usuário

```
/criar  →  dados do homenageado (aceite dos termos obrigatório, M-13)
        →  POST /api/lyrics/generate        (letra)
        →  usuário aprova/ajusta a letra
        →  POST /api/orders/create          (cria pedido, valida limite grátis, AGUARDANDO_PAGAMENTO)
        →  POST /api/suno/generate          (música é produzida ANTES do pagamento)
        →  polling /api/suno/status         (~5s, até 72 tentativas, ref limpo na desmontagem)
        →  prévia de 60s + checkout PIX (sku explícito, nunca valor livre)
        →  POST /api/payments/create        (BR Code com txid único)
        →  polling /api/payments/status
/entrega?orderId=…  →  libera MP3 (gate por paymentStatus do Firestore) / upsell do vídeo (+R$ 6,90)
                    →  upload de 10-20 fotos  →  render do vídeo no browser  →  Firebase Storage
```

## Onde ficam as regras de negócio

| Regra | Local | Observação |
|---|---|---|
| Preço (9,99 / 6,90 / 16,89) | `src/lib/pricing.js` | **No servidor** — cliente só escolhe o `sku` |
| Liberação do produto | `entrega/page.jsx:isPaid`, `homenagem/page.jsx:isPaid` | Deriva só de `paymentStatus` do Firestore |
| Limite de 5 prévias grátis | `api/orders/create/route.js:isBlockedByFreeLimit` | Reforçado no servidor (A-11) |
| Aprovação do pagamento | `src/lib/payments.js:applyPaymentApproval` | Único lugar (M-18) |
| Música vs. vídeo | `orderData.paymentIntentSku` (com fallback de heurística para pedidos antigos) | A-13 |
| Normalização de faixas | `src/lib/db.js:extractAudioTracks` | Único lugar correto |
| Templates de WhatsApp | `src/lib/whatsappTemplates.js` | Único lugar (M-19) |

## Para alterar X, leia Y

| Mudança | Arquivos |
|---|---|
| Preço / pacotes | `src/lib/pricing.js`, `api/payments/create/route.js` |
| Liberação / gating | `entrega/page.jsx`, `homenagem/page.jsx`, `api/orders/update/route.js` |
| Confirmação de pagamento | `src/lib/payments.js`, `src/lib/efi.js`, `api/webhooks/efi/route.js`, `api/payments/status/route.js` |
| Geração da música | `api/suno/generate`, `api/suno/status`, `api/suno/webhook`, `src/lib/db.js`, `src/lib/sunoPayload.js` |
| Letra / prompts | `api/lyrics/{generate,improve}/route.js`, `src/lib/gemini.js` |
| WhatsApp | `src/lib/whatsapp.js`, `src/lib/whatsappTemplates.js` |
| Schema do pedido | `api/orders/create/route.js` + toda escrita de `orders` (busque por `updateDoc(`) |
| Admin | `admin/page.jsx`, `admin/pedidos/[id]/page.jsx`, `api/orders/{search,update,delete}`, `src/lib/auth.js` |
| Vídeo | `api/video/generate/route.js`, `src/lib/videoGenerator.js`, `entrega/page.jsx` |
| Passos 1-9 do wizard | `criar/WizardSteps.jsx`, `criar/wizardOptions.js`, `criar/wizardStyles.js` |
| Passos 10+ do wizard, polling, checkout | `criar/page.jsx` (ainda não decomposto — ver M-20 no FIX_PLAN) |

## Build, deploy e qualidade

- Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`.
- CI: `.github/workflows/ci.yml` roda lint + typecheck + test + build em todo push/PR para `master`.
- Deploy: Cloudflare Pages, automático a cada `push origin master` (o CI não bloqueia isso — só sinaliza).
  Domínio `nsmusic.nsnexus.com.br`.
- `.eslintrc.json`, `tsconfig.json` (JS puro com `checkJs: false` — typecheck é opcional/informativo),
  `vitest.config.mjs`, `firestore.rules` (rascunho) e `firestore.indexes.json` versionados.
