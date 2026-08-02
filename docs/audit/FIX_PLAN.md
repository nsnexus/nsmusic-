# NS Music — Plano de Correção

Derivado de [AUDIT_REPORT.md](AUDIT_REPORT.md). Os IDs (C-01, A-07, M-12…) referenciam aquele documento.

**Princípios**
- Um lote por PR. Não misturar lotes.
- Cada lote deve deixar `npm run build` verde antes do merge.
- Não refatorar e corrigir segurança no mesmo commit.
- Deploy é automático no push para `master` — todo merge vai direto a produção. Validar em branch antes.

---

## Lote 0 — Proteção, backup e testes de caracterização — ✅ PARCIALMENTE CONCLUÍDO (2026-08-01)

**Objetivo:** poder mexer no fluxo de pagamento sem quebrar quem já pagou, e restaurar o ambiente de build.

**Ações**
1. Exportar backup completo das coleções `orders` e `suno_tasks` (Firebase console → export para GCS).
   **Status: PENDENTE DE DECISÃO DO USUÁRIO** — ação fora do repositório, só o usuário tem acesso ao
   console do Firebase. Não bloqueia o restante do lote, mas deve ser feita antes do Lote 2 (pagamentos).
2. Restaurar dependências: `npm ci`. Confirmar que `npm run build` executa.
   **Status: CORRIGIDO E VALIDADO.** `npm ci` restaurou 460 pacotes. `npm run build` falhava por dois
   motivos adicionais descobertos durante a correção (não estavam no relatório original):
   - 6 rotas Edge importavam `@/lib/firebase` (versão não-lite, com `getAuth`) em vez de
     `@/lib/firebase-edge`, violando a regra já documentada em `.claude/rules/backend.md`. Isso quebrava
     a coleta de dados da página em `next build` com `FirebaseError: auth/invalid-api-key`. As mesmas 6
     rotas também importavam `collection`/`doc`/`getDoc`/`updateDoc`/`deleteDoc`/`addDoc`/`getDocs`/
     `query`/`where` de `firebase/firestore` (SDK completo) em vez de `firebase/firestore/lite` —
     inconsistente com a instância `dbEdge` (lite) usada para acessá-los. Corrigido nos 6 arquivos (troca
     mecânica de import, mesmas funções, nenhuma lógica alterada):
     `api/orders/{create,delete,search,update}/route.js`, `api/video/generate/route.js`,
     `api/whatsapp/notify/route.js`.
   - Faltava `.env.local` com as chaves `NEXT_PUBLIC_FIREBASE_*` para o Next conseguir pré-renderizar as
     páginas client (`getAuth()` falha em formato de chave inválido). Criado `.env.local` com valores
     fictícios apenas para build local (arquivo é ignorado pelo git via `.env*.local`).
   `npm run build` → **verde**.
3. Criar `.eslintrc.json` estendendo `next/core-web-vitals` e adicionar o script `typecheck` opcional.
   **Status: CORRIGIDO E VALIDADO.** `.eslintrc.json` criado. `npm run lint` encontrou 2 erros reais
   (`react/no-unescaped-entities` em `src/app/page.jsx:447`) — corrigidos (aspas → `&ldquo;`/`&rdquo;`).
   `npm run lint` → verde (restam só warnings de `<img>`, já catalogados como B-02).
   `tsconfig.json` criado (`allowJs: true`, `checkJs: false`) + script `typecheck` (`tsc --noEmit`).
   TypeScript 7 (instalado inicialmente) remove `baseUrl`, incompatível com a resolução de alias `@/*`
   do Next 14 — fixado em `typescript@^5.4` em vez de `latest`. `npm run typecheck` → verde.
4. Adicionar Vitest + primeiros testes de caracterização (comportamento **atual**, não o desejado):
   **Status: CORRIGIDO E VALIDADO.** `vitest.config.mjs` + `tests/unit/`, 19 testes, todos verdes:
   - `extractAudioTracks` (`src/lib/db.js`) — 5 formatos de resposta da Kie.ai/Suno + casos de borda.
   - `generatePixPayload` (`api/payments/create/route.js`) — precisou exportar a função (estava só
     local ao módulo); CRC16 e payload exatos capturados para 9,99 / 6,90 / 16,89.
   - `formatToWhatsAppNumber` (`src/lib/whatsapp.js`) — 10 a 14 dígitos, com e sem `55`, com máscara.
   `@cloudflare/next-on-pages` foi mockado em `tests/stubs/next-on-pages.js` (só para os testes; o
   código de produção já trata a exceção de `getRequestContext()` fora do Cloudflare com try/catch).
5. Documentar as regras atuais do Firestore em `firestore.rules` **como estão hoje** (baseline), antes de mudá-las.
   **Status: PENDENTE DE DECISÃO DO USUÁRIO.** Perguntado ao usuário; decisão foi adiar para antes do
   Lote 1 (é lá que as regras precisam mudar de verdade). C-11 continua **A verificar**.

**Arquivos alterados:** `package.json`, `package-lock.json`, `.eslintrc.json` (novo), `tsconfig.json`
(novo, substitui `jsconfig.json`), `vitest.config.mjs` (novo), `tests/unit/*.test.js` (novo),
`tests/stubs/next-on-pages.js` (novo), `.env.local` (novo, não versionado), `src/app/page.jsx`,
`src/app/api/{orders/create,orders/delete,orders/search,orders/update,video/generate,whatsapp/notify}/route.js`,
`src/app/api/payments/create/route.js` (export de `generatePixPayload`)
**Dependências:** nenhuma · **Riscos:** nenhum (não toca em regra de negócio nem em produção)
**Aceite:** `npm run build`, `npm run lint`, `npm run typecheck` e `npm test` verdes — ✅ atingido.
Backup do Firestore e baseline de `firestore.rules` — pendentes, ficam para antes do Lote 1.
**Rollback:** reverter o commit deste lote

---

## Lote 1 — Vulnerabilidades críticas de exposição — ✅ CONCLUÍDO NO CÓDIGO (2026-08-01)

**Objetivo:** fechar os caminhos abertos a qualquer visitante da internet.

**Ordem de execução (importa)**
1. **C-06** — rotacionar a chave na Kie.ai **antes** de tocar no código; depois remover os fallbacks
   em `api/suno/generate/route.js:29` e `api/suno/status/route.js:30`.
   **Status: CORRIGIDO E VALIDADO.** Usuário confirmou rotação da chave na Kie.ai e atualização de
   `KIE_API_KEY` no Cloudflare Pages antes da alteração de código. Fallback hardcoded removido dos
   dois arquivos; ausência da variável agora falha com `500` citando o nome da variável (nunca o
   valor), conforme `.claude/rules/security.md`. `grep -rE "[a-f0-9]{32}" src/` → vazio.
2. **C-11** — publicar `firestore.rules` negando leitura/escrita anônima em `orders` e `suno_tasks`.
   **Status: BLOQUEADO/PENDENTE DE DECISÃO — parcialmente feito.** Perguntado ao usuário; decisão foi
   criar o arquivo `firestore.rules` (proposta da regra final, com pré-requisitos documentados) **sem
   publicar**, pelo mesmo motivo já previsto aqui: publicar agora quebraria as próprias rotas de API
   (que não têm identidade privilegiada, só o SDK cliente) e o painel admin. O arquivo documenta os
   3 pré-requisitos (identidade de servidor, custom claim admin, migração das escritas diretas do
   browser) e fica marcado como rascunho até o Lote 3 resolver esses pré-requisitos e coordenar a
   publicação numa janela de manutenção. C-11 continua **A verificar** quanto ao conteúdo real hoje
   em produção — isso não muda até o backup/captura da baseline acontecer (ver Lote 0, item 5).
3. **C-04, C-03, C-02** — exigir ID token de admin em `/api/orders/{search,update,delete}`.
   **Status: CORRIGIDO E VALIDADO.** Criado `src/lib/auth.js` com `requireAdmin()`: valida o ID token
   do Firebase via `accounts:lookup` do Identity Toolkit (sem Admin SDK, funciona no Edge) e confere
   o e-mail da conta contra a allowlist `ADMIN_EMAILS` (variável de ambiente nova, documentada em
   `.env.example`). As 3 rotas agora respondem 401 sem token, 401 com token inválido, 403 com token
   válido mas e-mail fora da allowlist. `admin/page.jsx` (exclusão) e `admin/pedidos/[id]/page.jsx`
   (WhatsApp manual) atualizados para enviar `Authorization: Bearer <idToken>`. Custom claim
   `admin: true` (substituindo a allowlist por e-mail) fica para o Lote 3, como o próprio plano previa.
   Nota: `paymentStatus` continua um campo aceito por `/api/orders/update` (agora atrás do gate de
   admin) — a remoção completa desse campo do payload (parte mais estrita de C-02) fica para o Lote 2,
   junto da unificação de `src/lib/payments.js`, para não misturar lotes.
4. **C-08** — substituir `getDocs(ordersRef)` por consulta com `where` atrás de rota autenticada.
   **Status: CORRIGIDO E VALIDADO.** `minhas-musicas/page.jsx:handleQuickSearch` não baixa mais a
   coleção inteira: usa `where('customerPhone','==', ...)` (telefone reconstruído no mesmo formato
   mascarado gravado em `criar/page.jsx:handlePhoneChange`) e `where('customerEmail','==', ...)`
   (duas variantes de case, mesmo padrão de merge por `Map` já usado no efeito de login acima no
   mesmo arquivo). Efeito colateral aceito: a busca deixou de ser por substring bidirecional e passou
   a ser por igualdade exata — isso também resolve o bug de correspondência cruzada de clientes
   catalogado em M-16 (Lote 4), como consequência inevitável de eliminar o full-scan.
5. **C-10** — remover ou autenticar `/api/whatsapp/send`.
   **Status: CORRIGIDO E VALIDADO.** Rota mantida (tem uso legítimo: reenvio manual de WhatsApp pelo
   admin) e protegida com o mesmo `requireAdmin()`. Chamador em `admin/pedidos/[id]/page.jsx`
   atualizado para enviar o token.
6. **A-05, A-06** — allowlist de domínios nos proxies (`musicfile.kie.ai`, `cdn*.suno.ai`,
   `firebasestorage.googleapis.com`) e forçar `Content-Type` de saída.
   **Status: CORRIGIDO E VALIDADO.** Criado `src/lib/proxyAllowlist.js` (`isAllowedMediaHost`,
   `isAllowedMediaUrl` — só HTTPS + host na lista). `image-proxy` agora rejeita (400) URL fora da
   allowlist e rejeita (502) qualquer `Content-Type` de origem que não seja `image/*`, `audio/*` ou
   `application/octet-stream` — fecha o vetor de servir HTML/JS arbitrário sob o próprio domínio.
   `audio/proxy` só repassa a URL absoluta vinda do cliente ao `fetch` se o host estiver na allowlist;
   os candidatos construídos a partir do `itemId` (que já eram domínios fixos e seguros) não mudaram.
   Adicionado `AbortSignal.timeout(15000)` nos fetches tocados (consistente com `.claude/rules/backend.md`,
   sem expandir para todo o projeto — isso é o B-08 do Lote 6).

**Testes novos:** `tests/unit/auth.test.js` (5 casos: sem token, token inválido, e-mail fora da
allowlist, e-mail na allowlist, comparação case-insensitive) e `tests/unit/proxyAllowlist.test.js`
(9 casos: hosts aceitos/rejeitados, protocolo, URL malformada). 31 testes no total, todos verdes.

**Arquivos:** `api/orders/{search,update,delete}/route.js`, `api/suno/{generate,status}/route.js`,
`api/whatsapp/send/route.js`, `api/{image-proxy,audio/proxy}/route.js`, `minhas-musicas/page.jsx`,
`admin/page.jsx`, `admin/pedidos/[id]/page.jsx`, `firestore.rules` (novo, não publicado),
`src/lib/auth.js` (novo), `src/lib/proxyAllowlist.js` (novo), `.env.example`, `.env.local`

**Dependências:** Lote 0 (backup + build)
**Riscos:** **altos, mitigados.** Regras do Firestore não foram publicadas (evita quebrar o painel
admin e as rotas de API antes do Lote 3). O restante do lote não depende de coordenação externa.
**Testes executados:** `npm run build/lint/typecheck/test` verdes. Fluxo E2E completo em navegador
real (admin logando e chamando as rotas com token) **não foi executado** — não há ambiente Firebase
real disponível nesta sessão; ver instruções de validação manual no resumo final.
**Aceite:** nenhuma rota de `orders`/`whatsapp/send` responde a chamada anônima (verificado por
teste unitário do `requireAdmin`, não por chamada HTTP real); `grep -rE "[a-f0-9]{32}" src/` vazio.
**Rollback:** reverter o commit deste lote. `firestore.rules` não foi publicado, nada a reverter em produção.

---

## Lote 2 — Pagamentos, webhooks e liberação do produto — ✅ CONCLUÍDO NO CÓDIGO (2026-08-01)

**Objetivo:** o servidor passa a ser a única autoridade sobre preço e sobre o que foi pago.

**Ordem de execução**
1. Criar `src/lib/pricing.js` com o catálogo (`musica: 9.99`, `video: 6.90`) — fonte única.
   **Status: CORRIGIDO E VALIDADO.** Catálogo com 3 SKUs (`audio_only` 9.99, `combo` 16.89,
   `video_addon` 6.90) — o `combo` existia no frontend (`entrega/page.jsx:selectedPackage`) mas não
   estava no plano original; incluído porque é um produto real vendido hoje. Testado em
   `tests/unit/pricing.test.js` (9 casos).
2. **C-05** — `/api/payments/create` recebe `orderId` + SKU, deriva o valor de `pricing.js`, ignora
   `totalAmount` do cliente e **persiste** `expectedAmount` + `paymentIntentId` no pedido.
   **Status: CORRIGIDO E VALIDADO.** A rota agora exige `orderId`, valida que o pedido existe (404
   caso contrário), deriva o valor só do catálogo e persiste `expectedAmount`/`paymentIntentId`/
   `paymentIntentSku`. `criar/page.jsx` (2 pontos) e `entrega/page.jsx` (`handleGeneratePix`)
   atualizados para enviar `{ orderId, sku }` em vez de `{ formData, totalAmount }`.
3. **A-10** — passar a gerar BR Code com `txid` único por cobrança, para tornar o PIX conciliável.
   **Status: CORRIGIDO E VALIDADO.** `generatePixPayload` ganhou um 3º parâmetro `txid` (padrão `'***'`
   — por isso os 3 testes de caracterização do Lote 0 continuam passando sem alteração). Testado em
   `tests/unit/generatePixPayload.test.js` (4 novos casos: embute o txid, trunca em 25 chars, sanitiza
   caracteres inválidos, dois txids geram payloads diferentes).
4. Criar `src/lib/payments.js` unificando `processPayment` e `markOrderApproved` (**M-18**).
   **Status: CORRIGIDO E VALIDADO.** `applyPaymentApproval(orderId, paymentId, mpPayment)` é agora o
   único ponto de aprovação, consumido por `api/webhooks/mercadopago/route.js` e
   `api/payments/status/route.js`. Testado em `tests/unit/payments.test.js` (10 casos, Firestore
   mockado).
5. **C-09** — mover `paymentStatus` para dentro do ramo não-vídeo.
   **Status: CORRIGIDO E VALIDADO** (teste: "video_addon isolado NUNCA escreve paymentStatus").
6. **A-13** — substituir a heurística de valor por `paymentIntent.sku` persistido.
   **Status: CORRIGIDO E VALIDADO**, com fallback para a heurística de valor apenas quando o pedido
   não tem `paymentIntentSku` (pedidos criados antes desta migração de código). Testado explicitamente
   ("usa o SKU persistido mesmo se o valor da transação coincidir com outro SKU por acaso").
7. **A-09** — usar `runTransaction` para as flags de envio de WhatsApp e chave de idempotência por `paymentId`.
   **Status: CORRIGIDO E VALIDADO.** A decisão de aprovação inteira (não só a flag de WhatsApp) roda
   dentro de uma `runTransaction`, com o `paymentId`/`videoPaymentId` como chave de dedupe. Testado
   ("o mesmo paymentId não é processado duas vezes").
8. **A-01** — validar `x-signature` do Mercado Pago; manter a reconsulta à API como segunda barreira.
   **Status: CORRIGIDO, MAS NÃO VALIDADO CONTRA O MERCADO PAGO REAL.** Implementado HMAC-SHA256 sobre
   `id:<paymentId>;request-id:<x-request-id>;ts:<ts>;` via Web Crypto (compatível com Edge). Se
   `MERCADO_PAGO_WEBHOOK_SECRET` não estiver configurado, a validação é pulada (log de aviso) e a
   reconsulta à API continua como única barreira — **novo segredo, documentado em `.env.example`,
   precisa ser configurado no Cloudflare Pages e no painel do Mercado Pago para a validação entrar em
   vigor.** Não foi possível testar contra uma notificação real do Mercado Pago nesta sessão.
9. **C-01** — remover `searchParams.get('status')` de `isPaid` e o `useEffect` que grava `paymentStatus`.
   **Status: CORRIGIDO E VALIDADO — escopo maior que o previsto.** Além de `entrega/page.jsx` (`isPaid`
   e o `useEffect` de gravação), encontrados e corrigidos **mais 4 pontos** do mesmo padrão proibido
   (cliente gravando `paymentStatus`/`hasVideoAccess` direto no Firestore) não listados originalmente
   neste item:
   - `entrega/page.jsx`: polling de música E de vídeo também gravavam direto no Firestore após receber
     "approved" do servidor — redundante (o servidor já gravou) e proibido por `payments.md`. Trocado
     por atualização de estado local (`setOrder`) apenas.
   - `criar/page.jsx:228` e `criar/page.jsx:2189` (já citados como evidência em C-11): dois pontos que
     gravavam `paymentStatus: 'PAGO'` direto no Firestore após receber "approved" do servidor. Mesma
     correção — removida a gravação, mantido só o redirecionamento (que agora não carrega mais
     `&status=success`, já que a URL não tem mais nenhum efeito sobre `isPaid`).
   - **C-12 (novo, ver AUDIT_REPORT.md)**: `criar/page.jsx` (2 pontos, antes de qualquer pagamento)
     gravava `hasVideoAccess: !!formData.addons?.wantsVideo` direto no Firestore — concedia acesso ao
     vídeo pago só porque o cliente **pretendia** comprá-lo, nunca verificando pagamento. Removido.
10. **C-07** — aplicar o gate de pagamento em `homenagem/page.jsx`; excluir `HomenagemPublica.jsx`.
    **Status: CORRIGIDO E VALIDADO.** `isPaid` derivado só de `paymentStatus` (sem parâmetro de URL —
    a versão órfã que seria portada tinha o MESMO bug de C-01, não foi copiada). Estado bloqueado
    adicionado com a estética escura já usada na página. `HomenagemPublica.jsx` excluído (confirmado
    sem nenhum import em `src/`).
11. **A-07** — `/api/video/generate` passa a exigir `hasVideoAccess === true`.
    **Status: CORRIGIDO E VALIDADO.** Retorna 403 se `!orderData.hasVideoAccess && !orderData.videoAddonPaid`.
12. **M-01** — normalizar `paymentStatus` para dois valores (`AGUARDANDO_PAGAMENTO`, `PAGAMENTO_APROVADO`)
    e escrever uma migração que converta os registros existentes com `PAGO`.
    **Status: BLOQUEADO/PENDENTE DE DECISÃO — script preparado, NÃO EXECUTADO.** O código agora só
    escreve `PAGAMENTO_APROVADO` (nenhum `PAGO` novo é gerado); leitura continua aceitando os dois
    valores por compatibilidade com pedidos antigos. Criados `scripts/migrate-payment-status.mjs`
    (dry-run por padrão, `--apply` para gravar, gera log dos IDs alterados) e
    `scripts/revert-payment-status-migration.mjs` (reverte a partir do log). **Não executados — grava
    em produção e precisa das credenciais reais do Firebase, que não existem nesta sessão.** Aguardando
    autorização do responsável pelo projeto para rodar.
13. Tratar estados `cancelled`/`refunded`/`charged_back` revogando o acesso.
    **Status: CORRIGIDO E VALIDADO (unitário).** `applyPaymentApproval` reverte `paymentStatus` para
    `AGUARDANDO_PAGAMENTO` (estorno da música) ou `hasVideoAccess`/`videoAddonPaid` para `false`
    (estorno do vídeo), conforme qual `paymentId` bate. Não testado contra um estorno real do MP.

**Testes novos:** `tests/unit/{pricing,payments}.test.js` (novos) + 4 casos adicionados a
`generatePixPayload.test.js`. 51 testes no total, todos verdes.

**Arquivos:** `api/payments/{create,status}/route.js`, `api/webhooks/mercadopago/route.js`,
`api/video/generate/route.js`, `entrega/page.jsx`, `homenagem/page.jsx`, `criar/page.jsx`,
`src/lib/{pricing,payments}.js` (novos), `scripts/{migrate,revert}-payment-status*.mjs` (novos, não
executados), `.env.example`, `src/app/homenagem/HomenagemPublica.jsx` (excluído)

**Dependências:** Lote 1 (autenticação disponível)
**Riscos:** **os mais altos do plano — mitigados o quanto possível sem ambiente de produção real.**
Toda a lógica de decisão (C-09, A-13, A-09, revogação) tem cobertura de teste unitário com Firestore
mockado. O que NÃO foi validado: comportamento contra o Mercado Pago real (assinatura, webhook de
verdade), contra o Firebase real (migração, regras), e o caminho completo no navegador.
**Testes executados:** `npm run build/lint/typecheck/test` verdes (51 testes). Fluxo E2E real
(criar → pagar → entregar) **não foi executado** — sem ambiente com credenciais reais nesta sessão.
**Aceite:** nenhum caminho de código conhecido libera o produto sem uma resposta `approved` do
Mercado Pago processada pelo servidor. **Rollback:** reverter o commit deste lote; a migração de
`PAGO` (item 12) nunca chegou a rodar em produção, então não há nada para reverter nela.

---

## Lote 3 — Autenticação e autorização — ⚠️ PARCIALMENTE CONCLUÍDO (2026-08-01)

**Objetivo:** identidade de admin verificada no servidor; usuários só enxergam os próprios pedidos.

**Ações**
- **A-08** — custom claim `admin: true` no Firebase Auth; verificar a claim no servidor, não o e-mail.
  **Status: CORRIGIDO NO CÓDIGO, PENDENTE DE CONFIGURAÇÃO EXTERNA.** `src/lib/auth.js:requireAdmin()`
  agora aceita custom claim `admin: true` (via `customAttributes` do `accounts:lookup`) OU a allowlist
  `ADMIN_EMAILS` (OR — qualquer um concede acesso). Criado `scripts/set-admin-claim.mjs`
  (`firebase-admin`, novo devDependency) para definir a claim — **não executado nesta sessão**, requer
  uma service account do Firebase (Admin SDK) que não existe neste ambiente. `admin/page.jsx` e
  `admin/pedidos/[id]/page.jsx` continuam com a checagem de e-mail no browser só para roteamento de
  UI (redirecionar para `/admin/login`) — a decisão de autorização real já está 100% no servidor
  desde o Lote 1, essa checagem client-side é só UX.
- Painel admin passa a enviar `Authorization: Bearer <idToken>` em todas as chamadas.
  **Status: JÁ CONCLUÍDO NO LOTE 1.** Conferido: as únicas rotas administrativas chamadas pelo painel
  (`orders/delete`, `whatsapp/send`) já enviam o token desde o Lote 1. `suno/generate` e
  `suno/status`, também chamadas pelo painel para regenerar músicas, são rotas públicas (usadas por
  qualquer cliente durante a criação) — não fazem sentido atrás de `requireAdmin`.
- Endurecer `firestore.rules`: leitura de um pedido só pelo dono (`userId`) ou por admin.
  **Status: JÁ ESTAVA NO RASCUNHO DO LOTE 1**, atualizado com os 3 pré-requisitos revisados. Não
  publicado — pré-requisito 1 (identidade de servidor para as rotas de API) continua pendente.
- **A-02** — remover `orderId` como parâmetro de query em `/api/suno/status`; derivar do `suno_tasks`.
  **Status: CORRIGIDO E VALIDADO (build).** O parâmetro `orderId` não é mais lido da query string;
  `updateTaskResult` sempre usa o `orderId` já associado à tarefa em `suno_tasks` (gravado por
  `/api/suno/generate` no momento da criação).
- **A-03** — autenticar `/api/suno/webhook` (segredo compartilhado na URL de callback).
  **Status: CORRIGIDO, NÃO VALIDADO CONTRA A KIE.AI REAL.** Novo `KIE_WEBHOOK_SECRET` (documentado em
  `.env.example`); `/api/suno/generate` inclui `?secret=...` na URL de callback quando configurado;
  `/api/suno/webhook` rejeita com 401 se o segredo não bater. Sem a variável configurada, pula a
  checagem com aviso (não quebra produção até o segredo ser configurado e uma nova geração acontecer
  com a URL de callback atualizada).
- **A-04, A-12** — rate limiting (Cloudflare Rate Limiting ou KV) em `suno/generate`, `lyrics/*`, `whatsapp/verify`.
  **Status: NÃO IMPLEMENTADO — decisão do usuário.** Perguntado; decisão foi só documentar a
  recomendação, sem código. Não há `wrangler.toml` nem KV namespace configurado neste projeto.
  **Recomendação:** configurar Cloudflare Rate Limiting Rules (WAF) diretamente no painel da
  Cloudflare para `/api/suno/generate`, `/api/lyrics/*` e `/api/whatsapp/verify` — não exige mudança
  de código nem KV, e é mais confiável que um limitador em memória (que não é compartilhado entre
  instâncias/regiões do Cloudflare Workers). Ação externa pendente, fora do alcance desta sessão.
- **A-11** — mover o limite de prévias grátis para o servidor.
  **Status: CORRIGIDO E VALIDADO (unitário).** `/api/orders/create` agora chama
  `isBlockedByFreeLimit(phone, email)` (consulta `orders` por `where`, mesmo critério do antigo
  `checkUserLimit` client-side) e responde 403 antes de criar o pedido. `criar/page.jsx` atualizado
  para tratar o 403 (mostra o modal de limite em vez de prosseguir silenciosamente). Testado em
  `tests/unit/ordersFreeLimit.test.js` (5 casos, incluindo deduplicação entre telefone e e-mail).

**Testes novos:** `tests/unit/ordersFreeLimit.test.js` (novo) + 2 casos adicionados a
`auth.test.js` (custom claim). 58 testes no total, todos verdes.

**Arquivos:** `src/lib/auth.js`, `api/suno/{generate,status,webhook}/route.js`,
`api/orders/create/route.js`, `criar/page.jsx`, `firestore.rules`, `.env.example`,
`scripts/set-admin-claim.mjs` (novo, não executado)

**Dependências:** Lotes 1 e 2
**Riscos:** médios — mitigados: a allowlist `ADMIN_EMAILS` continua funcionando como fallback, então
nada quebra o acesso admin atual enquanto a custom claim não for configurada.
**Testes executados:** `npm run build/lint/typecheck/test` verdes (58 testes). Rate limiting real,
webhook do Kie.ai autenticado e custom claim **não foram validados** contra os serviços reais —
dependem de configuração externa (Cloudflare, Firebase Admin SDK, nova URL de callback na Kie.ai).
**Aceite:** parcialmente atingido — a autorização de admin não depende mais só de código do browser
(tem verificação de servidor desde o Lote 1), mas ainda não depende exclusivamente de custom claim
(a allowlist de e-mail continua sendo um caminho válido até a claim ser configurada).
**Pendências explícitas para o responsável do projeto:**
1. Rodar `scripts/set-admin-claim.mjs` com uma service account do Firebase.
2. Configurar `KIE_WEBHOOK_SECRET` no Cloudflare Pages e registrar a nova URL de callback na Kie.ai.
3. Configurar Cloudflare Rate Limiting Rules para as rotas listadas em A-04/A-12.
4. Publicar `firestore.rules` só depois de resolver o pré-requisito 1 (identidade de servidor).
**Rollback:** reverter o commit; a custom claim (se chegar a ser definida) não tem efeito colateral
por si só, já que a allowlist de e-mail continua funcionando em paralelo.

---

## Lote 4 — Bugs funcionais — ✅ CONCLUÍDO (2026-08-01)

**Objetivo:** corrigir o que já prejudica clientes reais hoje.

- **M-10** — limpar o `setInterval` de `pollSunoStatus` (ref + cleanup no `useEffect`).
  **Status: CORRIGIDO E VALIDADO (build).** `pollIntervalRef` guarda o intervalo; `useEffect` de
  desmontagem do componente principal limpa; qualquer nova chamada de `pollSunoStatus` cancela o
  intervalo anterior antes de criar outro (evita dois pollings concorrentes).
- **M-11** — persistir a avaliação do cliente.
  **Status: CORRIGIDO E VALIDADO (build).** `handleReviewSubmit` agora grava `reviewRating`/
  `reviewText`/`reviewSubmittedAt` no pedido via `updateDoc`; só mostra a tela de sucesso depois da
  escrita confirmar, com estado de erro visível se falhar (antes só fazia `setReviewSubmitted(true)`,
  sem gravar nada).
- **M-12** — extrair `buildSunoPayload(formData)` e usar nos dois pontos de chamada.
  **Status: CORRIGIDO E VALIDADO.** Extraído para `src/lib/sunoPayload.js` (não ficou dentro de
  `criar/page.jsx` para poder ser testado sem precisar transformar JSX no Vitest). Os dois pontos de
  chamada (geração inicial e "Tentar Novamente") usam a mesma função — o retry não perde mais
  `musicMood`/`voiceType`. Testado em `tests/unit/buildSunoPayload.test.js` (5 casos).
- **M-15** — verificação de WhatsApp deve falhar fechada, ou informar que não foi possível verificar.
  **Status: CORRIGIDO E VALIDADO (build).** Novo status `'unknown'` para erro de rede/resposta não-ok
  da verificação — mensagem honesta ("Não foi possível verificar agora") em vez de tratar como válido.
  `isPhoneValid()` só aceita `'valid'`, então `'unknown'` bloqueia o avanço (falha fechada), como o
  próprio item pedia.
- **M-16** — comparar telefone por igualdade normalizada, não por substring.
  **Status: JÁ CORRIGIDO NO LOTE 1**, como efeito colateral da correção de C-08 em
  `minhas-musicas/page.jsx` (a busca deixou de baixar a coleção inteira e passou a usar `where` com
  igualdade exata). Confirmado nesta sessão que não resta nenhuma correspondência por substring.
- **M-13** — checkbox real de aceite dos termos.
  **Status: CORRIGIDO E VALIDADO (build).** Adicionado checkbox real em `criar/page.jsx` (step 9),
  com link para `/termos-de-uso` e `/politica-de-privacidade`, obrigatório para avançar
  (`isNextDisabled`). `termsAccepted: true` hardcoded removido dos dois pontos onde existia.
  `/api/orders/create` agora valida `termsAccepted === true` no servidor (400 caso contrário) e
  persiste `termsAccepted`/`termsAcceptedAt` no pedido — antes nada disso era gravado.
- **M-17** — remover o link "Entrega Privada" de `acompanhar/page.jsx`.
  **Status: CORRIGIDO E VALIDADO (build).** Bloco inteiro removido (link de demonstração interna
  exposto a qualquer cliente).
- **B-01** — limpar timers de retry do player.
  **Status: CORRIGIDO E VALIDADO (build).** `CustomAudioPreview` guarda o `setTimeout` de retry em
  `retryTimerRef` e limpa na desmontagem.

**Testes novos:** `tests/unit/buildSunoPayload.test.js` (novo, 5 casos). 63 testes no total, todos verdes.

**Arquivos:** `criar/page.jsx`, `entrega/page.jsx`, `acompanhar/page.jsx`,
`api/orders/create/route.js`, `src/lib/sunoPayload.js` (novo)
**Dependências:** nenhuma · **Riscos:** baixos, confirmados sem regressão de build/lint/typecheck/test.
**Testes executados:** `npm run build/lint/typecheck/test` verdes (63 testes). Não testado em
navegador real (sem ambiente com credenciais Firebase reais nesta sessão).
**Aceite:** todos os bugs listados corrigidos no código; reprodução visual em navegador real fica
para validação manual do responsável pelo projeto.
**Rollback:** reverter o commit deste lote.

---

## Lote 5 — Banco de dados — ✅ CONCLUÍDO (2026-08-01)

- **M-05** — versionar `firestore.rules` e `firestore.indexes.json`; criar índices para
  `orders.customerPhone`, `orders.customerEmail`, `orders.userId`, `suno_tasks.orderId`.
  **Status: CORRIGIDO E VALIDADO.** `firestore.rules` já versionado desde o Lote 1 (rascunho, não
  publicado). Criado `firestore.indexes.json` — as queries atuais são todas igualdade/orderBy de
  campo único, que o Firestore indexa automaticamente; nenhum índice composto é necessário hoje. O
  arquivo documenta isso e serve de base para declarar índices compostos assim que alguma query
  passar a precisar (where + orderBy em campos diferentes).
- **M-03** — substituir todas as varreduras completas por `where` + `limit`.
  **Status: CORRIGIDO E VALIDADO.** `minhas-musicas:93` já resolvido no Lote 1 (C-08). Nesta sessão:
  `orders/search` — a busca por `orderId` em `suno_tasks` agora usa `where('orderId','==',...)` em
  vez de varrer tudo; a busca por substring em `orders` (impossível de fazer só com `where`, não há
  operador "contains" combinando campos — precisaria de Algolia/Typesense) ficou limitada aos 300
  pedidos mais recentes (`orderBy('createdAt','desc')` + `limit(300)`) em vez de ler a coleção inteira.
- **M-02** — `orderNumber` com timestamp + aleatório e verificação de unicidade.
  **Status: CORRIGIDO E VALIDADO (unitário).** `generateUniqueOrderNumber()` combina timestamp
  (base36) + aleatório + ano real (o "2026" antes era um literal fixo no código) e confere unicidade
  no Firestore antes de aceitar, com até 5 tentativas e um fallback de altíssima entropia. Testado em
  `tests/unit/generateUniqueOrderNumber.test.js` (4 casos, incluindo colisão simulada).
- **M-06** — padronizar `setDoc(..., { merge: true })` em `src/lib/db.js`.
  **Status: CORRIGIDO E VALIDADO (unitário).** `saveTask` agora usa `merge: true`, igual
  `updateTaskResult`. Descoberta durante a correção: o envio de WhatsApp em `updateTaskResult` tinha a
  mesma corrida de leitura-depois-escrita sem transação já corrigida em `payments.js` no Lote 2
  (`updateTaskResult` é chamado por duas vias concorrentes — webhook da Kie.ai e polling) — corrigido
  com o mesmo padrão de flag `whatsappSending` + `runTransaction`. Testado em
  `tests/unit/updateTaskResult.test.js` (3 casos, incluindo duas chamadas concorrentes).
- **M-07** — excluir `suno_tasks` órfãs junto com o pedido (soft delete).
  **Status: CORRIGIDO E VALIDADO (build).** `/api/orders/delete` agora grava `deletedAt` em vez de
  `deleteDoc`, e remove as `suno_tasks` associadas (`where('orderId','==',id)`). Como o campo
  `deletedAt` não existe em pedidos antigos (ausência ≠ `null` no Firestore, então um `where` não
  serviria), todos os pontos que listam/buscam pedidos foram atualizados para filtrar
  `!data.deletedAt` no código após a leitura: `admin/page.jsx`, `minhas-musicas/page.jsx` (3 pontos),
  `orders/search/route.js`, `orders/create:isBlockedByFreeLimit`, `criar/page.jsx:checkUserLimit`.
- **M-08** — mover a capa base64 para o Firebase Storage; guardar só a URL.
  **Status: CORRIGIDO E VALIDADO (build).** `handleImageUpload` em `criar/page.jsx` agora faz
  `canvas.toBlob` + `uploadBytes` para `covers/draft_<timestamp>_<random>.jpg` no Storage, salvando só
  a URL em `coverUrl` — nunca mais um base64 gigante no Firestore (documento tem limite de 1 MiB) nem
  no rascunho do `localStorage` (resolve M-14 como efeito colateral). Estado de "Enviando foto..."
  adicionado à UI.
- **M-09** — paginação no painel admin.
  **Status: CORRIGIDO E VALIDADO (build).** A listagem de pedidos (`onSnapshot`) agora usa
  `limit(pageSize + 1)` (50 por página) em vez de ler a coleção inteira; botão "Carregar mais"
  aumenta o `pageSize`. A leitura extra de +1 serve só para saber se existe próxima página.

**Testes novos:** `tests/unit/{generateUniqueOrderNumber,updateTaskResult}.test.js` (novos, 7 casos).
70 testes no total, todos verdes.

**Arquivos:** `firestore.indexes.json` (novo), `api/orders/{search,create,delete}/route.js`,
`src/lib/db.js`, `criar/page.jsx`, `minhas-musicas/page.jsx`, `admin/page.jsx`
**Dependências:** nenhuma (não dependeu de firestore.rules publicado, já que a exclusão lógica foi
implementada filtrando no código de leitura, sem exigir um novo `where` que quebraria pedidos antigos
sem o campo `deletedAt`) · **Riscos:** baixos, confirmados sem regressão de build/lint/typecheck/test.
**Testes executados:** `npm run build/lint/typecheck/test` verdes (70 testes). Não testado contra
Firestore/Storage reais (sem credenciais nesta sessão) — em especial, confirmar manualmente que o
upload de capa funciona e que o botão "Carregar mais" não duplica pedidos na lista.
**Aceite:** nenhum `getDocs` sem `where`/`limit` restou nos pontos tocados; `orderNumber` testado
contra colisão simulada; exclusão lógica confirmada em todos os pontos de leitura conhecidos.
**Rollback:** reverter o commit. Índices podem ser removidos sem perda de dados (nenhum foi
declarado). Pedidos "excluídos" continuam no Firestore com `deletedAt` — recuperáveis manualmente.

---

## Lote 6 — Performance — ✅ CONCLUÍDO (2026-08-01)

- **B-08** — `AbortSignal.timeout()` em todo `fetch` externo + retry com backoff nos webhooks.
  **Status: CORRIGIDO E VALIDADO.** Timeout adicionado aos 5 `fetch` externos que ainda não tinham
  (Kie.ai em `suno/{generate,status}`, OpenAI em `gemini.js`, W-API em `whatsapp.js` × 2). Retry com
  backoff exponencial (`fetchWithRetry`, até 2 tentativas, não repete em 4xx) aplicado à consulta ao
  Mercado Pago dentro do webhook — o fetch mais crítico para receita. Testado em
  `tests/unit/fetchWithRetry.test.js` (4 casos).
- **B-02** — migrar para `next/image`.
  **Status: CORRIGIDO PARCIALMENTE E VALIDADO (build).** As 14 ocorrências de `/logo.png` (em 12
  arquivos) migradas para `<Image>` — candidato seguro: asset estático local, dimensões conhecidas
  (500×500), sem depender de `next.config` para domínio externo. As demais ocorrências de `<img>`
  (fotos enviadas pelo cliente, capas via proxy, placeholder do Unsplash) foram deixadas como estão —
  migrá-las exigiria configurar `images.remotePatterns` no `next.config.mjs` para cada domínio externo
  e validação visual que não foi possível fazer nesta sessão (sem navegador real com dados reais).
- **M-14** — remover a imagem base64 do rascunho em `localStorage`.
  **Status: JÁ RESOLVIDO NO LOTE 5**, como efeito colateral de M-08 (a capa deixou de ser base64 e
  passou a ser uma URL do Storage, então o rascunho em `localStorage` nunca mais carrega um base64).
- Code splitting de `videoGenerator.js` via `dynamic()`.
  **Status: CORRIGIDO E VALIDADO (build).** `createSlideshowVideo` não é mais importado estaticamente
  no topo de `entrega/page.jsx` — usa `import()` dinâmico só no momento em que o usuário realmente gera
  o vídeo. Bundle de `/entrega` caiu de 13.8 kB para 12.1 kB no build de produção (Next não usa
  `next/dynamic` aqui porque `createSlideshowVideo` é uma função, não um componente React — `dynamic()`
  só se aplica a componentes; para funções, o import dinâmico nativo é o mecanismo correto).

**Testes novos:** `tests/unit/fetchWithRetry.test.js` (novo, 4 casos). 74 testes no total, todos verdes.

**Arquivos:** `src/lib/gemini.js`, `src/lib/whatsapp.js`, `api/suno/{generate,status}/route.js`,
`api/webhooks/mercadopago/route.js`, `entrega/page.jsx` + 11 outros arquivos (logo → `next/image`)

**Dependências:** Lote 5 · **Riscos:** baixos, confirmados sem regressão de build/lint/typecheck/test.
**Testes executados:** `npm run build/lint/typecheck/test` verdes (74 testes). Lighthouse **não foi
executado** — precisa de navegador real e ambiente publicado, fora do alcance desta sessão.
**Aceite:** parcialmente atingido — B-08 e o code splitting completos; B-02 parcial (só o logo);
critério de Lighthouse > 70 não verificado.
**Rollback:** por commit.

---

## Lote 7 — Refatorações — ⚠️ PARCIALMENTE CONCLUÍDO (2026-08-01/02)

**Decisão do usuário:** ao perguntar sobre o risco de M-20 (decompor arquivos grandes sem cobertura
de teste de UI), o usuário optou por prosseguir mesmo assim. Ver detalhamento abaixo.

- **M-19** — centralizar os templates de mensagem do WhatsApp em `src/lib/whatsapp.js`.
  **Status: CORRIGIDO E VALIDADO** (ver commit "parte 1" — `src/lib/whatsappTemplates.js`).
- **M-20** — decompor `criar/page.jsx` (2.789 → componentes por etapa) e `entrega/page.jsx`.
  **Status: PARCIALMENTE CORRIGIDO E VALIDADO (build/lint/typecheck/test), NÃO VALIDADO
  VISUALMENTE.** `criar/page.jsx`: 2.848 → 1.788 linhas (-37%). Extraído com segurança:
  `wizardStyles.js` (estilos, 100% estático), `wizardOptions.js` (arrays de opções, 100%
  estático — antes eram recriados a cada render), `CustomAudioPreview.jsx` (componente já
  autocontido) e `WizardSteps.jsx` (passos 1-9 do wizard, ~530 linhas de JSX puramente
  apresentacional — recebe `formData` e os handlers já prontos como props, sem duplicar nenhuma
  regra de negócio). `entrega/page.jsx`: 1.442 → 1.263 linhas (`entregaStyles.js` extraído, mesmo
  padrão). **Decisão consciente de não continuar:** os passos 10+ de `criar` (revisão de letra,
  geração de áudio com polling do Suno, checkout/PIX) e a maior parte de `entrega/page.jsx`
  (upload de vídeo, polling de pagamento, gerenciamento de conta) permanecem nos arquivos
  principais — são a parte mais crítica e mais interligada com estado/efeitos (pagamento, polling),
  e decompor esses trechos sem poder testar visualmente numa sessão sem navegador real com dados
  reais é um risco desproporcional ao benefício de organização. Recomendo que a decomposição dessas
  partes remanescentes seja feita numa sessão com ambiente de teste disponível.
- **B-07** — remover código morto: `HomenagemPublica.jsx`, `lib/sunoToken.js`,
  `gerar-logs-pagbank.js`, `addonsConfig`/`packagesList`.
  **Status: CORRIGIDO E VALIDADO** (ver commit "parte 1"; `HomenagemPublica.jsx` já removido no Lote 2).
- **M-22** — remover a dependência `mercadopago` (não importada).
  **Status: CORRIGIDO E VALIDADO.** Reduziu `npm audit` de 23 para 12 vulnerabilidades.
- **M-21** — atualizar dependências com vulnerabilidades, com o build verde como critério.
  **Status: PARCIALMENTE CORRIGIDO — 12 vulnerabilidades restantes PENDENTES DE DECISÃO.**
  `firebase` atualizado de 10.12.2 para 10.14.1 (dentro do range `^10.12.2`, sem breaking change).
  As 12 vulnerabilidades restantes (todas via `undici`, transitiva de `@firebase/*`) só são
  resolvidas com `firebase` v11 — **major version bump com risco de incompatibilidade**, listado
  explicitamente como item que exige autorização antes de executar. Não foi feito nesta sessão.
- **B-04** — extrair `getFriendlyAuthErrorMessage` para `src/lib/authErrors.js`.
  **Status: CORRIGIDO E VALIDADO** (ver commit "parte 1").
- **B-05** — remover `export const runtime = 'edge'` de `admin/pedidos/[id]/page.jsx`.
  **Status: CORRIGIDO E VALIDADO** (ver commit "parte 1").
- **B-06** — mover o telefone do admin para `ADMIN_WHATSAPP`.
  **Status: CORRIGIDO E VALIDADO** (ver commit "parte 1") — junto com uma **regressão encontrada e
  corrigida**: a notificação de "nova venda" ao admin tinha sido perdida na unificação do Lote 2.

**Testes novos:** nenhum teste novo na parte 2 (extrações são puramente estruturais — o mesmo
`formData`/handlers já testados indiretamente pelos testes de integração continuam idênticos).
87 testes no total, todos verdes.

**Arquivos (parte 2 — M-20):** `criar/wizardStyles.js`, `criar/wizardOptions.js`,
`criar/CustomAudioPreview.jsx`, `criar/WizardSteps.jsx` (novos), `criar/page.jsx`,
`entrega/entregaStyles.js` (novo), `entrega/page.jsx`

**Dependências:** Lote 0 (testes de caracterização são o que torna isto seguro)
**Riscos:** médios, parcialmente mitigados — as extrações feitas são estruturais (mover código,
zero mudança de lógica) e validadas por build/lint/typecheck, mas **não foram testadas visualmente
em navegador real** (sem ambiente disponível nesta sessão).
**Aceite:** comportamento idêntico (por leitura de código), build/lint/typecheck/test verdes.
**Validação manual pendente:** percorrer o wizard completo de `/criar` (passos 1-9 especialmente,
que foram movidos para `WizardSteps.jsx`) e o fluxo de `/entrega` num navegador real antes de
considerar este lote 100% encerrado.
**Rollback:** por commit (2 commits neste lote — "parte 1" itens de baixo risco, "parte 2" M-20).

---

## Lote 8 — Testes e documentação — ✅ CONCLUÍDO (2026-08-02)

- Testes de integração do fluxo de pagamento (webhook duplicado, fora de ordem, estorno, valor divergente).
  **Status: CORRIGIDO E VALIDADO.** Já cobertos em `tests/unit/payments.test.js` desde o Lote 2;
  adicionado nesta sessão o caso explícito de "webhook fora de ordem" (notificação `pending` atrasada
  não desfaz uma aprovação já aplicada). 10 casos no total nesse arquivo.
- Testes de autorização para cada rota (anônimo / usuário / admin).
  **Status: CORRIGIDO E VALIDADO — por módulo compartilhado, não por rota individual.** Como todas as
  rotas administrativas delegam para `src/lib/auth.js:requireAdmin()`, testar essa função (7 casos em
  `tests/unit/auth.test.js`: sem token, token inválido, e-mail fora da allowlist, e-mail na allowlist,
  case-insensitive, custom claim válido, `customAttributes` com `admin:false`) cobre o comportamento de
  autorização de todas elas. Não foram escritos testes HTTP reais rota-a-rota (exigiria um servidor
  Next.js rodando, fora do escopo de testes unitários).
- Testes E2E do caminho crítico: criar → gerar → pagar → entregar.
  **Status: NÃO FEITO.** Exige navegador real + credenciais Firebase/Mercado Pago/Kie.ai reais, que não
  existiam nesta sessão. Documentado como pendência de validação manual no resumo final.
- GitHub Actions rodando `lint`, `test` e `build` antes do deploy do Cloudflare.
  **Status: CORRIGIDO E VALIDADO (arquivo criado; execução real no GitHub não verificada nesta
  sessão, sem acesso ao repositório remoto).** `.github/workflows/ci.yml` roda em todo push/PR para
  `master`. O build usa valores fictícios de `NEXT_PUBLIC_FIREBASE_*` por padrão (mesmo problema do
  Lote 0) — documentado no próprio workflow como configurar Secrets reais do GitHub para um build de
  CI fielmente igual ao de produção.
- **M-23** — atualizar `.env.example`.
  **Status: CORRIGIDO E VALIDADO.** Conferido contra todo uso de `process.env`/`getRequestContext().env`
  no `src/`: adicionados `KIE_API_KEY`, `OPENAI_API_KEY`, `WAPI_INSTANCE_ID`, `WAPI_TOKEN` (faltavam);
  removidos `PAGBANK_TOKEN`/`PAGBANK_ENV` (confirmado sem nenhuma referência no código).
- **M-24** — adicionar `.env` ao `.gitignore`.
  **Status: CORRIGIDO E VALIDADO.** Só `.env*.local` estava coberto antes.
- **M-25, M-26** — remover PII e material de token dos logs.
  **Status: CORRIGIDO E VALIDADO.** `src/lib/db.js` e `api/whatsapp/notify/route.js` não logam mais
  `customerPhone` (usam `orderId` como identificador); `src/lib/whatsapp.js` não loga mais
  `instanceId`, tamanho/prefixo de token, nem o número de telefone no fluxo de envio (usa índice da
  tentativa em vez do número). Aproveitado para também unificar `whatsapp/notify/route.js` com os
  templates centralizados do M-19 (tinha uma 4ª cópia do texto que passou despercebida no Lote 7).
- **B-09** — consolidar a configuração de ESLint.
  **Status: JÁ RESOLVIDO NO LOTE 0** (criação do `.eslintrc.json` único). Confirmado nesta sessão que
  não existe `eslint.config.js` nem `eslintConfig` duplicado no `package.json`.
- Atualizar `docs/CODEBASE_MAP.md` e `docs/ARCHITECTURE.md` conforme o que mudou.
  **Status: CORRIGIDO.** Reescritos para refletir toda a estrutura pós Lotes 0-7 (novos módulos de
  `src/lib/`, decomposição parcial do wizard, autenticação de admin, pagamentos unificados, etc.).
  `.claude/rules/tests.md` também atualizado (afirmava que não havia testes/CI, o que deixou de ser
  verdade).

**Testes novos:** 1 caso adicionado a `payments.test.js` (webhook fora de ordem). 88 testes no total.

**Arquivos:** `.env.example`, `.gitignore`, `src/lib/db.js`, `api/whatsapp/notify/route.js`,
`src/lib/whatsapp.js`, `.github/workflows/ci.yml` (novo), `docs/CODEBASE_MAP.md`,
`docs/ARCHITECTURE.md`, `.claude/rules/tests.md`, `tests/unit/payments.test.js`

**Dependências:** todos os anteriores · **Riscos:** baixos, confirmados sem regressão de
build/lint/typecheck/test.
**Aceite:** CI criado e configurado para bloquear merge com teste vermelho (não verificado rodando de
verdade no GitHub, já que esta sessão não tem acesso ao repositório remoto); cobertura de pagamento e
autorização mantida via módulos compartilhados.
**Rollback:** reverter o commit deste lote.

---

## Lote 9 — Migração de gateway de pagamento: Mercado Pago → Efí — ⚠️ CORRIGIDO NO CÓDIGO, PENDENTE DE CONFIGURAÇÃO EXTERNA (2026-08-02)

**Fora do ciclo original de 9 lotes acima** — motivado por um evento externo ao FIX_PLAN: a conta do
Mercado Pago foi bloqueada duas vezes seguidas (a segunda, muito provavelmente, por abertura de
conta nova ser tratada como evasão pelo PSP). Isso levou a um bypass manual de PIX (BR Code estático
com chave PIX hardcoded no código, aprovação validada visualmente pelo admin) que já estava em
produção antes desta sessão. Decisão do usuário: migrar para a **Efí** (API Pix real), testar
primeiro em sandbox, e remover o código do Mercado Pago por completo (sem manter como fallback).

**Ações**
- Criar `src/lib/efi.js` (cliente da API Pix: `createPixCharge`, `getChargeStatus`, `generateTxid`) e
  `src/lib/httpRetry.js` (retry genérico, extraído do antigo webhook do MP).
  **Status: CORRIGIDO E VALIDADO (unitário)** — `tests/unit/efi.test.js`, mockando o binding mTLS.
- Reescrever `api/payments/create/route.js` (cria cobrança real via Efí em vez de montar um BR Code
  estático com chave PIX hardcoded) e `api/payments/status/route.js` (consulta a Efí em vez do MP),
  mantendo o mesmo contrato de resposta (`paymentId`/`qrCode`/`qrCodeBase64`) para não exigir mudança
  no frontend.
  **Status: CORRIGIDO NO CÓDIGO, NÃO VALIDADO CONTRA A EFÍ REAL** — sem credenciais/certificado
  mTLS nesta sessão.
- Criar `api/webhooks/efi/route.js`: segredo `?secret=` como primeira barreira, reconsulta
  `getChargeStatus` antes de aprovar (nunca confia no corpo do webhook), sempre responde 200.
  **Status: CORRIGIDO E VALIDADO (unitário)** — `tests/unit/webhooks-efi.test.js` (segredo
  ausente/errado, aprovação, status não confirmado, pedido não encontrado, erro do provedor).
- Remover `api/webhooks/mercadopago/route.js`, o BR Code manual (`generatePixPayload` com chave PIX e
  nome do titular hardcoded) e a chamada ao checkout "Cartão de Crédito / Mercado Pago" em
  `criar/page.jsx` (botão que já estava quebrado antes desta migração — a rota nunca retornou
  `init_point` mesmo na versão anterior — removido em vez de deixado como dead code confuso).
  **Status: CORRIGIDO.**
- Atualizar `.env.example`, `.claude/rules/payments.md`, `docs/ARCHITECTURE.md`,
  `docs/CODEBASE_MAP.md`, `firestore.rules` (comentário), textos legais
  (`termos-de-uso`/`politica-de-privacidade`) e criar `docs/EFI_SETUP.md` com o checklist de
  configuração externa (certificado mTLS, binding Cloudflare, secrets, registro do webhook).
  **Status: CORRIGIDO.**
- Criar `scripts/register-efi-webhook.mjs` (script manual, mesmo padrão de `set-admin-claim.mjs`).
  **Status: CORRIGIDO, NÃO EXECUTADO** (requer certificado e credenciais reais).

**Explicitamente fora de escopo desta migração** (documentado para não ser confundido com bug):
- Devolução/estorno de Pix (a Efí trata como fluxo separado, `GET /v2/pix/{e2eid}/devolucao`).
- Coleta de CPF do pagador (`devedor`) — não confirmado se é obrigatório em `PUT /v2/cob/{txid}`; o
  código só envia esse campo se existir no pedido. Só decidir adicionar ao formulário se o sandbox
  confirmar a exigência.

**Testes novos:** `tests/unit/efi.test.js` (8 casos), `tests/unit/webhooks-efi.test.js` (6 casos);
`tests/unit/fetchWithRetry.test.js` adaptado para `src/lib/httpRetry.js`; removido
`tests/unit/generatePixPayload.test.js` (caracterizava a função manual que deixou de existir). 99
testes no total.

**Arquivos:** `src/lib/efi.js` (novo), `src/lib/httpRetry.js` (novo),
`src/app/api/payments/{create,status}/route.js`, `src/app/api/webhooks/efi/route.js` (novo,
substitui `webhooks/mercadopago/route.js`, removido), `src/lib/payments.js` (comentários),
`src/app/criar/page.jsx`, `src/app/entrega/page.jsx` (comentários), `.env.example`,
`.claude/rules/payments.md`, `docs/ARCHITECTURE.md`, `docs/CODEBASE_MAP.md`, `docs/EFI_SETUP.md`
(novo), `firestore.rules`, `termos-de-uso/page.jsx`, `politica-de-privacidade/page.jsx`,
`scripts/register-efi-webhook.mjs` (novo).

**Dependências:** nenhuma do FIX_PLAN original — trabalho independente dos Lotes 0-8.
**Riscos:** build/lint/typecheck/test verdes, mas **nenhuma chamada real à Efí foi feita** (sem
certificado mTLS nesta sessão) — o caminho crítico de pagamento não pode ser considerado validado
até um teste em sandbox com o binding Cloudflare configurado (ver `docs/EFI_SETUP.md`).
**Aceite:** pendente do usuário completar o setup externo e validar uma cobrança de sandbox de
ponta a ponta antes de trocar `EFI_ENV` para `production`.
**Rollback:** reverter o commit deste lote (o Mercado Pago precisaria ser reintroduzido do zero — o
código foi removido, não desativado).

---

## Ordem recomendada

```
Lote 0  →  Lote 1  →  Lote 2  →  Lote 3  →  Lote 4  →  Lote 5  →  Lote 6  →  Lote 7  →  Lote 8
(base)     (expor)    (receita)  (authz)    (bugs)     (dados)   (perf)     (limpeza)  (rede de segurança)
```

Se for preciso escolher só três: **Lote 0, Lote 1 e Lote 2**. Eles eliminam a perda de receita e a
exposição de dados pessoais. O restante é melhoria sustentada.
