# NS Music — Mapa da Base de Código

> Índice de navegação. Não contém código. Use-o para localizar o arquivo certo **antes** de abrir qualquer coisa.
> Arquitetura e diagramas: [ARCHITECTURE.md](ARCHITECTURE.md). Problemas conhecidos: [audit/AUDIT_REPORT.md](audit/AUDIT_REPORT.md).

## Visão geral

Plataforma de **músicas personalizadas geradas por IA**. O cliente preenche um wizard com a história do
homenageado, a IA escreve a letra, a Suno (via Kie.ai) grava o áudio, o cliente ouve uma prévia e paga
PIX (R$ 9,99) para liberar os MP3 completos. Add-on de vídeo slideshow por + R$ 6,90.

- **Stack**: Next.js 14 (App Router) · JavaScript puro (sem TypeScript) · React 18
- **Runtime**: Cloudflare Pages Edge (`@cloudflare/next-on-pages`) — todas as rotas API são `runtime = 'edge'`
- **Banco**: Firebase Firestore (SDK **client**, não Admin) — coleções `orders`, `suno_tasks`
- **Storage**: Firebase Storage (fotos do vídeo homenagem)
- **Pacotes**: npm (`package-lock.json`) · Node 24 local

## Diretórios

| Caminho | Conteúdo |
|---|---|
| `src/app/` | Páginas (App Router) + rotas de API |
| `src/app/api/` | 15 Route Handlers, todos Edge |
| `src/lib/` | Integrações e acesso a dados |
| `src/components/` | Componentes compartilhados (apenas 1) |
| `public/` | Áudios de demo, capas, logo |
| `.agents/` | Rulebook legado do projeto (`AGENTS.md`) — ainda é fonte de verdade sobre intenção |

## Páginas e rotas

| Rota | Arquivo | Acesso |
|---|---|---|
| `/` | `src/app/page.jsx` | Pública (landing) |
| `/criar` | `src/app/criar/page.jsx` | Pública — **wizard principal, 2789 linhas** |
| `/entrega` | `src/app/entrega/page.jsx` | Pública por `?orderId=` — **liberação do produto, 1443 linhas** |
| `/acompanhar` | `src/app/acompanhar/page.jsx` | Pública por `?orderId=` |
| `/homenagem` | `src/app/homenagem/page.jsx` | Pública por `?orderId=` — **sem gate de pagamento** |
| `/minhas-musicas` | `src/app/minhas-musicas/page.jsx` | Firebase Auth (cliente) |
| `/login` | `src/app/login/page.jsx` | Pública |
| `/admin` | `src/app/admin/page.jsx` | Firebase Auth + checagem de e-mail **no browser** |
| `/admin/login` | `src/app/admin/login/page.jsx` | Pública |
| `/admin/pedidos/[id]` | `src/app/admin/pedidos/[id]/page.jsx` | Idem `/admin` |
| `/termos-de-uso`, `/politica-de-privacidade` | idem | Públicas, estáticas |

## APIs (`src/app/api/`)

Nenhuma rota possui autenticação, autorização ou rate limiting no servidor. Ver `audit/AUDIT_REPORT.md`.

| Endpoint | Arquivo:símbolo | Função |
|---|---|---|
| `POST /api/orders/create` | `orders/create/route.js:POST` | Cria pedido em `orders` |
| `POST /api/orders/update` | `orders/update/route.js:POST` | Atualiza `paymentStatus`/`audioUrl`/`productionStatus` |
| `POST /api/orders/delete` | `orders/delete/route.js:POST` | Exclui pedidos em lote |
| `GET /api/orders/search` | `orders/search/route.js:GET` | Varredura completa da coleção |
| `POST /api/payments/create` | `payments/create/route.js:generatePixPayload` | Gera BR Code PIX estático |
| `GET /api/payments/status` | `payments/status/route.js:markOrderApproved` | Consulta MP e aprova pedido |
| `POST/GET /api/webhooks/mercadopago` | `webhooks/mercadopago/route.js:processPayment` | Webhook de pagamento |
| `POST /api/suno/generate` | `suno/generate/route.js:POST` | Dispara geração na Kie.ai |
| `GET /api/suno/status` | `suno/status/route.js:GET` | Polling do status da música |
| `POST /api/suno/webhook` | `suno/webhook/route.js:POST` | Callback da Kie.ai |
| `POST /api/lyrics/generate` | `lyrics/generate/route.js:POST` | Compõe a letra |
| `POST /api/lyrics/improve` | `lyrics/improve/route.js:POST` | Ajusta a letra |
| `POST /api/video/generate` | `video/generate/route.js:POST` | Registra fotos do slideshow |
| `POST /api/whatsapp/{send,notify,verify}` | `whatsapp/*/route.js:POST` | Mensagens e verificação de número |
| `GET /api/audio/proxy`, `GET /api/image-proxy` | `audio/proxy/route.js`, `image-proxy/route.js` | Proxies de mídia (URL arbitrária) |

## Banco de dados

Firestore, **sem migrations e sem `firestore.rules` versionado**. Schema implícito, definido em
`orders/create/route.js:POST` (campos iniciais) e estendido ad-hoc por escritas espalhadas.

- **`orders`** — pedido + PII do cliente + letra + URLs de áudio + estado de pagamento.
  Campos de pagamento: `paymentStatus`, `paymentId`, `paidAt`, `videoPaymentId`, `hasVideoAccess`, `videoAddonPaid`.
  Campos de produção: `productionStatus`, `audioUrl`, `audioFiles`, `sunoTaskId`, `slideshowImages`, `videoStatus`.
  Flags de notificação: `whatsappSent`, `paymentWhatsappSent`, `videoPaymentWhatsappSent` (+ sufixos `Sending`/`At`).
- **`suno_tasks`** — `{ status, result, orderId, updatedAt }`, escrito por `src/lib/db.js:saveTask` / `updateTaskResult`.

Sem índices declarados, sem constraints, sem chave única, sem transações. Relacionamento
`suno_tasks.orderId → orders.<docId>` mantido apenas por convenção da aplicação.

## Autenticação

- **Cliente**: Firebase Auth (`signInWithEmailAndPassword`) em `src/app/login/page.jsx`, usado por `/minhas-musicas`.
- **Admin**: mesmo Firebase Auth + comparação de string de e-mail **no browser**
  (`admin/login/page.jsx:31`, `admin/page.jsx:52`, `admin/pedidos/[id]/page.jsx:46`).
- **Servidor**: nenhuma. Nenhuma rota lê `Authorization`, cookie ou verifica ID token. Não há `src/middleware.js`.

## Pagamentos

Ponto de entrada: `src/app/criar/page.jsx:getTotalPrice` (preço calculado no cliente) →
`POST /api/payments/create` → `generatePixPayload` (BR Code **estático**, sem txid) →
polling em `criar/page.jsx:218` e `entrega/page.jsx:151` contra `GET /api/payments/status`.

Confirmação real acontece em dois lugares que duplicam a mesma lógica:
`webhooks/mercadopago/route.js:processPayment` e `payments/status/route.js:markOrderApproved`.

## Geração das músicas

`criar/page.jsx` → `POST /api/lyrics/generate` (`src/lib/gemini.js:runGeminiWithFailover` — OpenAI primário,
Gemini fallback com rotação de chaves) → aprovação da letra pelo usuário →
`POST /api/suno/generate` → Kie.ai → resultado chega por **duas** vias concorrentes:
`POST /api/suno/webhook` e polling `GET /api/suno/status`, ambas convergindo em
`src/lib/db.js:updateTaskResult` (que também dispara o WhatsApp).
Normalização das faixas: `src/lib/db.js:extractAudioTracks`.

**A geração ocorre antes do pagamento** — a cobrança acontece só para liberar o download.

## Armazenamento

- Áudios: hospedados na Kie.ai/Suno; servidos ao browser via `GET /api/audio/proxy`.
- Fotos do vídeo: Firebase Storage, upload direto do browser (`src/app/entrega/page.jsx`).
- Renderização do vídeo: **no browser**, via Canvas + MediaRecorder (`src/lib/videoGenerator.js:createSlideshowVideo`).
- Capa: base64 dentro do documento Firestore e do `localStorage`.

## Painel administrativo

`src/app/admin/page.jsx` (lista, `onSnapshot` direto no Firestore) e
`src/app/admin/pedidos/[id]/page.jsx` (detalhe, `getDoc`/`updateDoc` direto).
Também chama `/api/orders/{search,update,delete}`.

## Integrações externas

| Serviço | Módulo | Variável |
|---|---|---|
| Kie.ai (Suno) | `api/suno/*` | `KIE_API_KEY` |
| OpenAI | `src/lib/gemini.js` | `OPENAI_API_KEY` |
| Google Gemini | `src/lib/gemini.js` | `GEMINI_API_KEYS` (lista separada por vírgula) |
| Mercado Pago | `api/payments/status`, `api/webhooks/mercadopago` | `MERCADO_PAGO_ACCESS_TOKEN` |
| W-API (WhatsApp) | `src/lib/whatsapp.js` | `WAPI_INSTANCE_ID`, `WAPI_TOKEN` |
| Firebase | `src/lib/firebase.js`, `firebase-edge.js` | `NEXT_PUBLIC_FIREBASE_*` |

`src/lib/sunoToken.js:getValidToken` é código morto (integração direta com suno.com, sem chamadores).

## Fluxo completo do usuário

```
/criar  →  dados do homenageado
        →  POST /api/lyrics/generate        (letra)
        →  usuário aprova/ajusta a letra
        →  POST /api/orders/create          (cria pedido, AGUARDANDO_PAGAMENTO)
        →  POST /api/suno/generate          (música é produzida ANTES do pagamento)
        →  polling /api/suno/status         (~5s, até 72 tentativas)
        →  prévia de 60s + checkout PIX
        →  POST /api/payments/create        (BR Code estático)
        →  polling /api/payments/status
/entrega?orderId=…  →  libera MP3 / upsell do vídeo (+R$ 6,90)  →  upload de 10-20 fotos
                    →  render do vídeo no browser  →  Firebase Storage
```

## Onde ficam as regras de negócio

| Regra | Local | Observação |
|---|---|---|
| Preço (9,99 / 6,90 / 16,89) | `criar/page.jsx:536-540`, `entrega/page.jsx:256-261` | **Somente no cliente** |
| Liberação do produto | `entrega/page.jsx:69` (`isPaid`) | **Somente no cliente** |
| Limite de 5 prévias grátis | `criar/page.jsx:799-853` (`checkUserLimit`) | localStorage |
| Aprovação do pagamento | `webhooks/mercadopago:82-125`, `payments/status:117-139` | Duplicada |
| Música vs. vídeo | heurística de valor `6.90` | Frágil |
| Normalização de faixas | `src/lib/db.js:extractAudioTracks` | Único lugar correto |

## Para alterar X, leia Y

| Mudança | Arquivos |
|---|---|
| Preço / pacotes | `criar/page.jsx:515-540`, `entrega/page.jsx:256-275`, `api/payments/create/route.js` |
| Liberação / gating | `entrega/page.jsx:69-95`, `homenagem/page.jsx`, `api/orders/update/route.js` |
| Confirmação de pagamento | `api/webhooks/mercadopago/route.js`, `api/payments/status/route.js` |
| Geração da música | `api/suno/generate`, `api/suno/status`, `api/suno/webhook`, `src/lib/db.js` |
| Letra / prompts | `api/lyrics/{generate,improve}/route.js`, `src/lib/gemini.js` |
| WhatsApp | `src/lib/whatsapp.js` + os 3 pontos que montam mensagem (`db.js`, `webhooks/mercadopago`, `payments/status`) |
| Schema do pedido | `api/orders/create/route.js` + toda escrita de `orders` (busque por `updateDoc(`) |
| Admin | `admin/page.jsx`, `admin/pedidos/[id]/page.jsx`, `api/orders/{search,update,delete}` |
| Vídeo | `api/video/generate/route.js`, `src/lib/videoGenerator.js`, `entrega/page.jsx` |

## Build, deploy e qualidade

- Scripts: `dev`, `build`, `start`, `lint`. **Não existem** `typecheck` nem `test`.
- Deploy: Cloudflare Pages, automático a cada `push origin master`. Domínio `nsmusic.nsnexus.com.br`.
- Não há `.eslintrc*`, `wrangler.toml`, `firestore.rules`, nem configuração de testes no repositório.
