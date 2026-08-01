# NS Music — Plano de Correção

Derivado de [AUDIT_REPORT.md](AUDIT_REPORT.md). Os IDs (C-01, A-07, M-12…) referenciam aquele documento.

**Princípios**
- Um lote por PR. Não misturar lotes.
- Cada lote deve deixar `npm run build` verde antes do merge.
- Não refatorar e corrigir segurança no mesmo commit.
- Deploy é automático no push para `master` — todo merge vai direto a produção. Validar em branch antes.

---

## Lote 0 — Proteção, backup e testes de caracterização

**Objetivo:** poder mexer no fluxo de pagamento sem quebrar quem já pagou, e restaurar o ambiente de build.

**Ações**
1. Exportar backup completo das coleções `orders` e `suno_tasks` (Firebase console → export para GCS).
2. Restaurar dependências: `npm ci`. Confirmar que `npm run build` executa.
3. Criar `.eslintrc.json` estendendo `next/core-web-vitals` e adicionar o script `typecheck` opcional.
4. Adicionar Vitest + primeiros testes de caracterização (comportamento **atual**, não o desejado):
   - `extractAudioTracks` (`src/lib/db.js`) — 5 formatos de resposta da Kie.ai.
   - `generatePixPayload` (`api/payments/create`) — CRC16 correto para 9,99 / 6,90 / 16,89.
   - `formatToWhatsAppNumber` (`src/lib/whatsapp.js`) — números de 10 a 13 dígitos.
5. Documentar as regras atuais do Firestore em `firestore.rules` **como estão hoje** (baseline), antes de mudá-las.

**Arquivos:** `package.json`, `.eslintrc.json`, `firestore.rules` (novo), `tests/` (novo)
**Dependências:** nenhuma · **Riscos:** nenhum (não toca em código de produção)
**Aceite:** `npm run build` e `npm test` verdes; backup verificado; baseline das regras commitado
**Rollback:** reverter o PR

---

## Lote 1 — Vulnerabilidades críticas de exposição

**Objetivo:** fechar os caminhos abertos a qualquer visitante da internet.

**Ordem de execução (importa)**
1. **C-06** — rotacionar a chave na Kie.ai **antes** de tocar no código; depois remover os fallbacks
   em `api/suno/generate/route.js:29` e `api/suno/status/route.js:30`.
2. **C-11** — publicar `firestore.rules` negando leitura/escrita anônima em `orders` e `suno_tasks`.
   ⚠️ Isto quebra C-01/C-08 e o painel admin ao mesmo tempo — precisa ir junto com o Lote 3 ou atrás
   de uma janela de manutenção. Se não for possível coordenar, adiar apenas este item para o Lote 3.
3. **C-04, C-03, C-02** — exigir ID token de admin em `/api/orders/{search,update,delete}`.
4. **C-08** — substituir `getDocs(ordersRef)` por consulta com `where` atrás de rota autenticada.
5. **C-10** — remover ou autenticar `/api/whatsapp/send`.
6. **A-05, A-06** — allowlist de domínios nos proxies (`musicfile.kie.ai`, `cdn*.suno.ai`,
   `firebasestorage.googleapis.com`) e forçar `Content-Type` de saída.

**Arquivos:** `api/orders/{search,update,delete}/route.js`, `api/suno/{generate,status}/route.js`,
`api/whatsapp/send/route.js`, `api/{image-proxy,audio/proxy}/route.js`, `minhas-musicas/page.jsx`,
`firestore.rules`, `src/lib/auth.js` (novo — verificação de ID token)

**Dependências:** Lote 0 (backup + build)
**Riscos:** **altos.** Fechar as regras do Firestore quebra as escritas feitas pelo cliente
(`entrega/page.jsx:84`, `criar/page.jsx:228`). Fazer em branch e testar o fluxo completo.
**Testes:** cada rota sem `Authorization` → 401; com token de não-admin → 403; com token de admin → 200.
Proxy com URL fora da allowlist → 400.
**Aceite:** nenhuma rota de `orders` responde a chamada anônima; `grep -rE "[a-f0-9]{32}" src/` vazio.
**Rollback:** reverter o PR **e** republicar as regras anteriores (baseline do Lote 0).

---

## Lote 2 — Pagamentos, webhooks e liberação do produto

**Objetivo:** o servidor passa a ser a única autoridade sobre preço e sobre o que foi pago.

**Ordem de execução**
1. Criar `src/lib/pricing.js` com o catálogo (`musica: 9.99`, `video: 6.90`) — fonte única.
2. **C-05** — `/api/payments/create` recebe `orderId` + SKU, deriva o valor de `pricing.js`, ignora
   `totalAmount` do cliente e **persiste** `expectedAmount` + `paymentIntentId` no pedido.
3. **A-10** — passar a gerar BR Code com `txid` único por cobrança, para tornar o PIX conciliável.
4. Criar `src/lib/payments.js` unificando `processPayment` e `markOrderApproved` (**M-18**).
5. **C-09** — mover `paymentStatus` para dentro do ramo não-vídeo.
6. **A-13** — substituir a heurística de valor por `paymentIntent.sku` persistido.
7. **A-09** — usar `runTransaction` para as flags de envio de WhatsApp e chave de idempotência por `paymentId`.
8. **A-01** — validar `x-signature` do Mercado Pago; manter a reconsulta à API como segunda barreira.
9. **C-01** — remover `searchParams.get('status')` de `isPaid` e o `useEffect` que grava `paymentStatus`.
10. **C-07** — aplicar o gate de pagamento em `homenagem/page.jsx`; excluir `HomenagemPublica.jsx`.
11. **A-07** — `/api/video/generate` passa a exigir `hasVideoAccess === true`.
12. **M-01** — normalizar `paymentStatus` para dois valores (`AGUARDANDO_PAGAMENTO`, `PAGAMENTO_APROVADO`)
    e escrever uma migração que converta os registros existentes com `PAGO`.
13. Tratar estados `cancelled`/`refunded`/`charged_back` revogando o acesso.

**Arquivos:** `api/payments/{create,status}/route.js`, `api/webhooks/mercadopago/route.js`,
`api/video/generate/route.js`, `entrega/page.jsx`, `homenagem/page.jsx`, `criar/page.jsx`,
`src/lib/{pricing,payments}.js` (novos)

**Dependências:** Lote 1 (autenticação disponível)
**Riscos:** **os mais altos do plano.** Um erro aqui bloqueia clientes que pagaram. Manter, durante uma
semana, um log de auditoria de toda transição de `paymentStatus`.
**Testes:** `totalAmount: 0.01` → valor de catálogo prevalece; webhook de R$ 6,90 em pedido não pago →
`paymentStatus` inalterado; webhook duplicado → uma única mensagem de WhatsApp; assinatura inválida → 401;
`/entrega?status=success` sem pagamento → conteúdo bloqueado.
**Aceite:** nenhum caminho conhecido libera o produto sem confirmação do provedor de pagamento.
**Rollback:** reverter o PR; a migração de `PAGO` precisa de script inverso preparado antes.

---

## Lote 3 — Autenticação e autorização

**Objetivo:** identidade de admin verificada no servidor; usuários só enxergam os próprios pedidos.

**Ações**
- **A-08** — custom claim `admin: true` no Firebase Auth; verificar a claim no servidor, não o e-mail.
- Painel admin passa a enviar `Authorization: Bearer <idToken>` em todas as chamadas.
- Endurecer `firestore.rules`: leitura de um pedido só pelo dono (`userId`) ou por admin.
- **A-02** — remover `orderId` como parâmetro de query em `/api/suno/status`; derivar do `suno_tasks`.
- **A-03** — autenticar `/api/suno/webhook` (segredo compartilhado na URL de callback).
- **A-04, A-12** — rate limiting (Cloudflare Rate Limiting ou KV) em `suno/generate`, `lyrics/*`, `whatsapp/verify`.
- **A-11** — mover o limite de prévias grátis para o servidor.

**Arquivos:** `src/lib/auth.js`, todas as rotas de `api/`, páginas de `admin/`, `firestore.rules`
**Dependências:** Lotes 1 e 2
**Riscos:** médios — perder o acesso admin durante a transição. Definir a claim antes de exigir a claim.
**Testes:** conta não-admin não acessa `/admin` nem as rotas; usuário A não lê pedido de B.
**Aceite:** nenhuma decisão de autorização depende de código do browser.
**Rollback:** reverter o PR; a custom claim pode permanecer sem efeito colateral.

---

## Lote 4 — Bugs funcionais

**Objetivo:** corrigir o que já prejudica clientes reais hoje.

- **M-10** — limpar o `setInterval` de `pollSunoStatus` (ref + cleanup no `useEffect`).
- **M-11** — persistir a avaliação do cliente.
- **M-12** — extrair `buildSunoPayload(formData)` e usar nos dois pontos de chamada.
- **M-15** — verificação de WhatsApp deve falhar fechada, ou informar que não foi possível verificar.
- **M-16** — comparar telefone por igualdade normalizada, não por substring.
- **M-13** — checkbox real de aceite dos termos.
- **M-17** — remover o link "Entrega Privada" de `acompanhar/page.jsx`.
- **B-01** — limpar timers de retry do player.

**Arquivos:** `criar/page.jsx`, `entrega/page.jsx`, `minhas-musicas/page.jsx`, `acompanhar/page.jsx`
**Dependências:** nenhuma (pode correr em paralelo aos Lotes 2-3, arquivos parcialmente sobrepostos —
sequenciar com o Lote 2 em `criar`/`entrega`)
**Riscos:** baixos · **Testes:** ver AUDIT_REPORT §8 · **Aceite:** cada bug reproduzido antes e não reproduzível depois
**Rollback:** por commit individual

---

## Lote 5 — Banco de dados

- **M-05** — versionar `firestore.rules` e `firestore.indexes.json`; criar índices para
  `orders.customerPhone`, `orders.customerEmail`, `orders.userId`, `suno_tasks.orderId`.
- **M-03** — substituir todas as varreduras completas por `where` + `limit`.
- **M-02** — `orderNumber` com timestamp + aleatório e verificação de unicidade.
- **M-06** — padronizar `setDoc(..., { merge: true })` em `src/lib/db.js`.
- **M-07** — excluir `suno_tasks` órfãs junto com o pedido (soft delete).
- **M-08** — mover a capa base64 para o Firebase Storage; guardar só a URL.
- **M-09** — paginação no painel admin.

**Dependências:** Lote 3 (regras já endurecidas) · **Riscos:** médios — índices ausentes fazem queries falharem
**Testes:** cada consulta com índice criado; `orderNumber` único em 10.000 gerações
**Aceite:** nenhum `getDocs` sem filtro no `src/` · **Rollback:** índices podem ser removidos sem perda de dados

---

## Lote 6 — Performance

- **B-08** — `AbortSignal.timeout()` em todo `fetch` externo + retry com backoff nos webhooks.
- **B-02** — migrar para `next/image`.
- **M-14** — remover a imagem base64 do rascunho em `localStorage`.
- Code splitting de `videoGenerator.js` via `dynamic()`.

**Dependências:** Lote 5 · **Riscos:** baixos · **Aceite:** Lighthouse mobile > 70 em `/` e `/criar`
**Rollback:** por commit

---

## Lote 7 — Refatorações

- **M-19** — centralizar os templates de mensagem do WhatsApp em `src/lib/whatsapp.js`.
- **M-20** — decompor `criar/page.jsx` (2.789 → componentes por etapa) e `entrega/page.jsx`.
- **B-07** — remover código morto: `HomenagemPublica.jsx`, `lib/sunoToken.js`,
  `gerar-logs-pagbank.js`, `addonsConfig`/`packagesList`.
- **M-22** — remover a dependência `mercadopago` (não importada).
- **M-21** — atualizar dependências com vulnerabilidades, com o build verde como critério.
- **B-04** — extrair `getFriendlyAuthErrorMessage` para `src/lib/authErrors.js`.
- **B-05** — remover `export const runtime = 'edge'` de `admin/pedidos/[id]/page.jsx`.
- **B-06** — mover o telefone do admin para `ADMIN_WHATSAPP`.

**Dependências:** Lote 0 (testes de caracterização são o que torna isto seguro)
**Riscos:** médios — refatorar arquivos grandes sem cobertura é arriscado; por isso vem depois dos testes
**Aceite:** comportamento idêntico, testes verdes, build verde · **Rollback:** por commit

---

## Lote 8 — Testes e documentação

- Testes de integração do fluxo de pagamento (webhook duplicado, fora de ordem, estorno, valor divergente).
- Testes de autorização para cada rota (anônimo / usuário / admin).
- Testes E2E do caminho crítico: criar → gerar → pagar → entregar.
- GitHub Actions rodando `lint`, `test` e `build` antes do deploy do Cloudflare.
- **M-23** — atualizar `.env.example`; **M-24** — adicionar `.env` ao `.gitignore`.
- **M-25, M-26** — remover PII e material de token dos logs.
- **B-09** — consolidar a configuração de ESLint.
- Atualizar `docs/CODEBASE_MAP.md` e `docs/ARCHITECTURE.md` conforme o que mudou.

**Dependências:** todos os anteriores · **Riscos:** baixos
**Aceite:** CI bloqueia merge com teste vermelho; cobertura das rotas de pagamento e autorização
**Rollback:** n/a

---

## Ordem recomendada

```
Lote 0  →  Lote 1  →  Lote 2  →  Lote 3  →  Lote 4  →  Lote 5  →  Lote 6  →  Lote 7  →  Lote 8
(base)     (expor)    (receita)  (authz)    (bugs)     (dados)   (perf)     (limpeza)  (rede de segurança)
```

Se for preciso escolher só três: **Lote 0, Lote 1 e Lote 2**. Eles eliminam a perda de receita e a
exposição de dados pessoais. O restante é melhoria sustentada.
