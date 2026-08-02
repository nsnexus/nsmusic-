# NS Music — Relatório de Auditoria Técnica

**Data:** 2026-08-01 · **Commit:** `29400f4` (branch `master`, working tree limpo)
**Modo:** somente leitura. Nenhum arquivo de código foi alterado, nenhuma dependência atualizada,
nenhum dado de produção acessado.
**Escopo:** 43 arquivos de código em `src/` (14.474 linhas), configuração, `.agents/`, dependências.

---

## 1. Resumo executivo

O NS Music funciona e vende, mas **não possui fronteira de confiança entre cliente e servidor**. O
sistema foi construído sobre uma decisão estrutural — usar o SDK *cliente* do Firebase tanto no
browser quanto nas rotas Edge — que torna as rotas de API incapazes de autorizar qualquer coisa. Como
consequência direta, **preço, status de pagamento e identidade de administrador são todos decididos no
navegador do usuário**.

Existem pelo menos quatro caminhos independentes para obter o produto pago sem pagar, sendo o mais
simples uma URL: `/entrega?orderId=<id>&status=success`. Endpoints não autenticados permitem listar
todos os pedidos com PII de clientes, alterar o status de pagamento de qualquer pedido, excluir
pedidos em lote e disparar mensagens de WhatsApp arbitrárias a partir do número comercial. Há uma
chave de API de terceiro versionada em texto claro no repositório.

O sistema **não possui testes automatizados** e, no estado atual do repositório, **não compila** —
`node_modules` está incompleto e o binário do Next.js não está instalado, de modo que `npm run build`
e `npm run lint` falham antes de executar.

**Recomendação:** tratar os itens CRÍTICOS como incidente ativo. Os itens C-01 a C-05 são exploráveis
por qualquer visitante com um navegador, sem ferramentas especiais, e três deles causam perda direta
de receita.

## 2. Estado geral do sistema

| Dimensão | Avaliação |
|---|---|
| Funcionalidade do caminho feliz | Boa — o fluxo criar → gerar → pagar → entregar está completo |
| Segurança | **Crítica** — sem autenticação de servidor em nenhuma rota |
| Integridade de pagamentos | **Crítica** — valor definido pelo cliente; PIX não conciliável |
| Modelagem de dados | Fraca — schema implícito, sem índices, constraints ou transações |
| Qualidade / testes | Build restaurado no Lote 0 (`npm run build/lint/typecheck/test` verdes, 19 testes de caracterização). Ver nota em C-11 e no Lote 0 do `FIX_PLAN.md`. |
| Performance | Média — varreduras completas de coleção; componentes muito grandes |
| Manutenibilidade | Baixa — lógica de pagamento duplicada, arquivos de 2.789 linhas |
| Documentação | Boa intenção (`.agents/AGENTS.md`), mas o código viola as próprias regras |

## 3. Descobertas por severidade

| Severidade | Qtd. | Categorias predominantes |
|---|---|---|
| **CRÍTICA** | 12 | Vulnerabilidade, bug confirmado de receita (inclui C-12, descoberto no Lote 2) |
| **ALTA** | 14 | Vulnerabilidade, risco arquitetural, bug confirmado |
| **MÉDIA** | 21 | Dívida técnica, bug provável, performance (inclui B-10, descoberto no Lote 0) |
| **BAIXA** | 8 | Dívida técnica, melhoria |
| **Total** | **55** | |

Legenda de confiança: **Confirmado** = lido diretamente no código e verificado; **Provável** =
inferido com forte evidência mas sem execução; **A verificar** = depende de configuração fora do repositório.

---

## 4. Problemas críticos

### C-01 — Liberação do produto por parâmetro de URL
- **Categoria:** VULNERABILIDADE / BUG CONFIRMADO · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/entrega/page.jsx:69` (`isPaid`) e `:84-94` (efeito de persistência)
- **Evidência:** `isPaid` inclui a cláusula `searchParams.get('status') === 'success'`. Um `useEffect`
  logo abaixo grava `paymentStatus: 'PAGAMENTO_APROVADO'` no Firestore sempre que `isPaid` for verdadeiro.
- **Gatilho:** visitar `/entrega?orderId=<id>&status=success`.
- **Impacto:** acesso completo aos MP3 sem pagamento **e** marcação permanente do pedido como pago no
  banco, o que corrompe o relatório de vendas e dispara o WhatsApp de confirmação.
- **Reprodução:** criar um pedido pelo fluxo normal, anotar o `orderId`, abrir a URL acima antes de pagar.
- **Correção:** derivar `isPaid` exclusivamente de `order.paymentStatus` vindo do Firestore; usar o
  parâmetro de URL apenas para *disparar* uma reconsulta a `/api/payments/status`, nunca como verdade.
  Remover o efeito que escreve `paymentStatus` a partir do cliente.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (build/lint/typecheck/testes unitários) — não validado
  em navegador real. `isPaid` não depende mais de `searchParams`; o `useEffect` que gravava
  `paymentStatus` foi removido. Durante a correção, encontrados mais 4 pontos do mesmo padrão proibido
  não listados aqui originalmente: dois pollings em `entrega/page.jsx` (música e vídeo) e dois em
  `criar/page.jsx:228,2189` (já citados como evidência em C-11) — todos gravavam `paymentStatus`/
  `hasVideoAccess` direto no Firestore a partir do cliente depois de uma resposta "approved" do
  servidor. Todos corrigidos da mesma forma (gravação já acontece no servidor; cliente só espelha
  estado local). Ver também **C-12**, uma vulnerabilidade correlata encontrada no mesmo arquivo.
- **Risco de regressão:** médio — usuários que pagam de fato dependem hoje desse redirecionamento para
  ver o conteúdo liberado. A correção precisa vir junto com C-05/A-01 (confirmação server-side confiável).
- **Teste:** abrir `/entrega?orderId=X&status=success` com pedido não pago e verificar que o áudio
  permanece bloqueado e que o documento no Firestore não é alterado.

### C-02 — `POST /api/orders/update` aceita `paymentStatus` de qualquer origem
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/orders/update/route.js:10-22` (`POST`)
- **Evidência:** o handler desestrutura `paymentStatus` do corpo e o grava com `updateDoc`, sem
  qualquer checagem de identidade. Não existe `src/middleware.js` no projeto.
- **Gatilho:** um único `POST` com `{ "orderId": "...", "paymentStatus": "PAGAMENTO_APROVADO" }`.
- **Impacto:** liberação gratuita de qualquer pedido; também permite sobrescrever `audioUrl` e
  `productionStatus` de terceiros.
- **Reprodução:** obter um `orderId` via C-04 e enviar o POST acima.
- **Correção:** exigir ID token do Firebase verificado no servidor e restringir a rota ao admin;
  `paymentStatus` não deve ser aceito de nenhum cliente — apenas do fluxo de confirmação de pagamento.
- **Risco de regressão:** baixo — a rota é usada apenas pelo painel admin.
- **Teste:** requisição sem `Authorization` deve retornar 401; com token de não-admin, 403.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (build/lint/typecheck/testes unitários) — não validado
  por chamada HTTP real. `requireAdmin()` em `src/lib/auth.js` aplicado. `paymentStatus` continua
  aceito pelo payload (agora atrás do gate de admin); remoção completa desse campo fica para o Lote 2.

### C-03 — `POST /api/orders/delete` exclui pedidos sem autenticação
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/orders/delete/route.js:7-24` (`POST`)
- **Evidência:** aceita `orderIds` (array) e chama `deleteDoc` em laço, sem verificação alguma.
- **Gatilho:** um POST com a lista de IDs obtida via C-04.
- **Impacto:** destruição em massa e irreversível de pedidos, incluindo pedidos pagos e não entregues.
- **Correção:** mesma de C-02, mais *soft delete* (`deletedAt`) em vez de exclusão física.
- **Risco de regressão:** baixo. **Teste:** idem C-02.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (mesmo mecanismo de C-02) — não validado por chamada
  HTTP real. *Soft delete* (`deletedAt`) continua pendente — não fazia parte do escopo do Lote 1
  (que era só autenticação); fica para o Lote 5 (banco de dados) junto com M-07.

### C-04 — `GET /api/orders/search` expõe toda a base de clientes
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/orders/search/route.js:37-64` (`GET`)
- **Evidência:** faz `getDocs` da coleção inteira e retorna `customerName`, `customerPhone`,
  `honoreeName`, `audioUrl`, `paymentStatus` e o ID real do documento para qualquer substring.
- **Gatilho:** `GET /api/orders/search?search=a`.
- **Impacto:** vazamento de dados pessoais (LGPD), vazamento das URLs dos áudios (produto entregue sem
  pagamento) e fornecimento dos IDs necessários para explorar C-01, C-02 e C-03.
- **Correção:** exigir autenticação de admin, usar `where` + `limit` no Firestore e devolver o mínimo de campos.
- **Risco de regressão:** baixo. **Teste:** chamada anônima deve retornar 401.
- **Status (2026-08-01):** CORRIGIDO PARCIALMENTE E NÃO VALIDADO POR HTTP REAL. `requireAdmin()`
  aplicado (fecha a exposição anônima, que era o item crítico). A troca do `getDocs` full-scan por
  `where` + `limit` e a redução dos campos retornados **não foram feitas** — ficam para o Lote 5
  (M-03), já que o Lote 1 tratou só da autenticação.

### C-05 — O valor a pagar é definido pelo cliente
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/payments/create/route.js:35-38` (`POST` → `generatePixPayload`)
- **Evidência:** `const { totalAmount } = body` é passado direto para a geração do BR Code. O preço é
  calculado no browser em `criar/page.jsx:536-540` (`getTotalPrice`) e enviado em `criar/page.jsx:2094`.
- **Gatilho:** interceptar a requisição e alterar `totalAmount` para `0.01`.
- **Impacto:** o cliente gera um PIX válido de qualquer valor e recebe o produto completo.
- **Correção:** tabela de preços no servidor; a rota recebe `orderId` + SKU e deriva o valor. Persistir
  o valor esperado no pedido no momento da criação da cobrança.
- **Risco de regressão:** médio — exige alinhar os SKUs entre `criar` e `entrega`.
- **Teste:** POST com `totalAmount: 0.01` deve ser ignorado e o BR Code gerado com o valor de catálogo.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (unitário) — não validado com Firestore/Mercado Pago
  reais. `src/lib/pricing.js` é a fonte única; a rota ignora `totalAmount`, exige `orderId` existente
  e persiste `expectedAmount`/`paymentIntentSku`. `criar/page.jsx` e `entrega/page.jsx` atualizados
  para enviar `sku` em vez de valor.

### C-06 — Chave de API de terceiro versionada em texto claro
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/suno/generate/route.js:29` e `src/app/api/suno/status/route.js:30`
- **Evidência:** literal de 32 caracteres hexadecimais usado como fallback de `KIE_API_KEY` quando a
  variável de ambiente não está definida. (Valor deliberadamente não reproduzido neste relatório.)
- **Impacto:** a chave está no histórico do Git; qualquer pessoa com acesso ao repositório pode
  consumir créditos pagos da conta Kie.ai. `.agents/AGENTS.md` §5 proíbe explicitamente esse padrão.
- **Correção:** **rotacionar a chave na Kie.ai imediatamente** (ela deve ser considerada comprometida),
  remover os dois fallbacks, falhar com 500 se a variável não existir, e purgar o valor do histórico.
- **Risco de regressão:** baixo, desde que `KIE_API_KEY` esteja configurada no Cloudflare Pages.
- **Teste:** `grep -rE "[a-f0-9]{32}" src/` não deve retornar nada; a rota deve responder 500 sem a variável.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO. Usuário confirmou rotação da chave na Kie.ai e
  atualização de `KIE_API_KEY` no Cloudflare Pages antes da remoção do fallback. `grep -rE
  "[a-f0-9]{32}" src/` → vazio. Comportamento sem a variável validado por leitura de código (responde
  500 citando o nome da variável); não testado contra o Cloudflare Pages real.

### C-07 — `/homenagem` entrega áudio e vídeo sem qualquer verificação de pagamento
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/homenagem/page.jsx:76-172` (`HomenagemContent`)
- **Evidência:** renderiza `<audio controls src=…>` e `<video controls>` incondicionalmente; não há
  nenhuma referência a `isPaid` ou `paymentStatus` no arquivo. A versão com gate correto existe em
  `src/app/homenagem/HomenagemPublica.jsx` mas **não é importada em lugar nenhum**.
- **Gatilho:** `/homenagem?orderId=<id>`.
- **Impacto:** download completo do produto sem pagamento.
- **Correção:** portar o gate de `HomenagemPublica.jsx` para a rota real e excluir o arquivo órfão.
- **Risco de regressão:** baixo. **Teste:** acessar a rota com pedido não pago e confirmar bloqueio.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (build) — não validado em navegador real. Importante:
  `HomenagemPublica.jsx` (o "gate correto" citado acima) tinha o MESMO bug de C-01
  (`searchParams.get('status') === 'success'` na sua própria variável `isPaid`) — a lógica NÃO foi
  portada como estava; o gate novo em `homenagem/page.jsx` usa só `order.paymentStatus`. O arquivo
  órfão foi excluído após confirmar (`grep`) que não tinha nenhum import em `src/`.

### C-08 — `/minhas-musicas` baixa a coleção `orders` inteira para o browser
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/minhas-musicas/page.jsx:93-95` (`handleQuickSearch`)
- **Evidência:** `getDocs(ordersRef)` sem `where`; a filtragem por telefone/e-mail ocorre **depois**,
  no cliente (`:105-129`).
- **Impacto:** todo visitante que usa a busca recebe, na resposta de rede, os dados de todos os
  clientes — nome, telefone, e-mail, história pessoal e letra.
- **Correção:** mover a busca para uma rota autenticada com `where` no servidor.
- **Risco de regressão:** baixo. **Teste:** inspecionar a aba Rede e confirmar que só o próprio pedido trafega.
- **Status (2026-08-01):** CORRIGIDO, MAS NÃO VALIDADO EM NAVEGADOR REAL. `handleQuickSearch` agora usa
  `where('customerPhone', ...)` / `where('customerEmail', ...)` em vez de `getDocs` da coleção inteira
  — verificado por leitura de código e pelo build, não com Firestore real (sem credenciais nesta
  sessão). Efeito colateral: a busca de telefone passou a ser por igualdade exata (formato mascarado),
  não mais substring bidirecional — isso também fecha M-16 como consequência.

### C-09 — Pagar o add-on de vídeo (R$ 6,90) libera a música (R$ 9,99)
- **Categoria:** BUG CONFIRMADO (receita) · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/webhooks/mercadopago/route.js:109-123` (`processPayment`) e
  `src/app/api/payments/status/route.js:126-137` (`markOrderApproved`)
- **Evidência:** o objeto `updates` recebe `paymentStatus: 'PAGAMENTO_APROVADO'` **antes** do `if
  (isVideoPayment)`, portanto é aplicado nos dois ramos.
- **Gatilho:** pedido não pago cujo cliente paga apenas o add-on de R$ 6,90.
- **Impacto:** produto de R$ 9,99 liberado por R$ 6,90; perda de R$ 3,09 por ocorrência e inconsistência contábil.
- **Correção:** mover `paymentStatus` para dentro do ramo `else`; o pagamento de vídeo deve alterar
  apenas `hasVideoAccess`/`videoAddonPaid`.
- **Risco de regressão:** médio — pedidos que hoje dependem desse efeito colateral podem ficar bloqueados.
- **Teste:** simular webhook com `transaction_amount: 6.90` em pedido não pago e verificar que
  `paymentStatus` permanece `AGUARDANDO_PAGAMENTO`.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO. `applyPaymentApproval` (`src/lib/payments.js`) só
  escreve `paymentStatus` no ramo em que `skuApprovesMusic(sku)` é verdadeiro; testado explicitamente
  em `tests/unit/payments.test.js` ("video_addon isolado NUNCA escreve paymentStatus").

### C-10 — `POST /api/whatsapp/send` permite enviar mensagens arbitrárias pelo número comercial
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado
- **Arquivo:** `src/app/api/whatsapp/send/route.js:7-34` (`POST`)
- **Evidência:** aceita `{ phone, message }` livres e chama `sendWhatsAppMessageDetailed`, sem autenticação.
- **Impacto:** qualquer pessoa pode enviar spam ou phishing **em nome da marca**, com risco de banimento
  do número na W-API e responsabilização legal. Consumo financeiro direto da conta W-API.
- **Correção:** remover a rota ou exigir autenticação de admin + rate limiting.
- **Risco de regressão:** baixo — verificar antes se o painel admin a utiliza.
- **Teste:** chamada anônima deve retornar 401.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (unitário) — não validado por HTTP real. Rota mantida
  (confirmado uso legítimo em `admin/pedidos/[id]/page.jsx`, reenvio manual de WhatsApp) e protegida
  com `requireAdmin()`. Rate limiting explícito não foi adicionado — não fazia parte do escopo deste
  item no Lote 1 (rate limiting é A-04/A-12, Lote 3).

### C-11 — Regras do Firestore ausentes do repositório com escrita direta pelo browser
- **Categoria:** RISCO ARQUITETURAL · **Severidade:** CRÍTICA · **Confiança:** Confirmado (arquitetura) / **A verificar** (conteúdo das regras)
- **Arquivo:** ausência de `firestore.rules`; escritas em `entrega/page.jsx:84-94`, `criar/page.jsx:228`,
  `criar/page.jsx:2191`, `admin/pedidos/[id]/page.jsx:98`
- **Evidência:** o código depende de o browser conseguir gravar `paymentStatus` em `orders`. Para isso
  funcionar em produção, as regras precisam permitir escrita anônima nessa coleção.
- **Impacto:** se confirmado, qualquer visitante pode ler e escrever a base inteira a partir do console
  do navegador, contornando todas as rotas de API.
- **Verificação necessária:** no console do Firebase, revisar as regras da coleção `orders`. Este é o
  item de maior alavancagem da auditoria e **não pôde ser confirmado a partir do repositório**.
- **Correção:** versionar `firestore.rules`, negar escrita direta do cliente em `orders` e mover as
  escritas para rotas autenticadas.
- **Status (2026-08-01):** BLOQUEADO/PENDENTE DE DECISÃO. No Lote 1, perguntado novamente ao usuário;
  decisão foi criar `firestore.rules` na raiz do repositório como **proposta** da regra final (com os
  3 pré-requisitos documentados no próprio arquivo), **sem publicar** no Firebase — publicar agora
  quebraria as rotas de API (sem identidade privilegiada) e o painel admin ao mesmo tempo, exatamente
  o risco que este relatório já previa. O conteúdo real das regras em produção continua **A verificar**
  — isso só é resolvido com acesso ao console do Firebase, fora do alcance desta sessão. No Lote 2,
  os campos de aprovação de pagamento (`paymentStatus`, `hasVideoAccess`) deixaram de ser gravados
  pelo cliente em `entrega/page.jsx` e `criar/page.jsx` (ver C-01/C-12) — mas `admin/pedidos/[id]/page.jsx:98`
  continua gravando `paymentStatus` direto no Firestore a partir do painel admin (cliente), porque
  migrá-lo para uma rota de API exigiria expandir `/api/orders/update` para todos os campos que esse
  formulário edita (lyrics, audioUrl2, wavUrl, videoUrl, qrCodeUrl) — fora do escopo de pagamentos do
  Lote 2. Fica para o Lote 3, junto com `admin/page.jsx` enviando `Authorization: Bearer <idToken>`.

### C-12 — `criar/page.jsx` concedia acesso ao vídeo pago só por intenção de compra, sem pagamento
- **Categoria:** VULNERABILIDADE · **Severidade:** CRÍTICA · **Confiança:** Confirmado · **Descoberta:** Lote 2 (2026-08-01), não estava no relatório original
- **Arquivo:** `src/app/criar/page.jsx` (2 pontos, nos handlers dos botões "Gerar PIX" e "Cartão de Crédito")
- **Evidência:** antes de qualquer chamada a `/api/payments/create`, o código gravava
  `hasVideoAccess: !!formData.addons?.wantsVideo` direto no Firestore — ou seja, bastava o cliente
  marcar a intenção de comprar o vídeo (um checkbox no formulário) para o campo de acesso pago ser
  concedido, independentemente de qualquer pagamento.
- **Gatilho:** marcar o add-on de vídeo no wizard e clicar em "Gerar PIX" (sem nunca pagar).
- **Impacto:** acesso gratuito ao vídeo homenagem (R$ 6,90) para qualquer pedido, e (combinado com
  `homenagem/page.jsx` antes do gate de C-07) potencialmente exibição do vídeo sem pagamento nenhum.
- **Correção:** removida a gravação de `hasVideoAccess` nesses dois pontos; o campo só é definido pelo
  servidor em `src/lib/payments.js:applyPaymentApproval`, após confirmação real de pagamento.
- **Status (2026-08-01):** CORRIGIDO E VALIDADO (build) — não validado em navegador real.

---

## 5. Problemas de segurança (ALTA)

| ID | Título | Arquivo:símbolo | Confiança |
|---|---|---|---|
| A-01 | **CORRIGIDO, NÃO VALIDADO CONTRA O MERCADO PAGO REAL (Lote 2).** Validação HMAC-SHA256 do header `x-signature` implementada; pulada com aviso se `MERCADO_PAGO_WEBHOOK_SECRET` não estiver configurado (novo segredo, ver `.env.example`). Reconsulta à API do MP mantida como segunda barreira | `api/webhooks/mercadopago/route.js` | Confirmado |
| A-02 | **CORRIGIDO E VALIDADO (Lote 3).** `orderId` não é mais lido da query string de `/api/suno/status`; `updateTaskResult` sempre usa o `orderId` gravado em `suno_tasks` na criação da tarefa | `api/suno/status/route.js` | Confirmado |
| A-03 | **CORRIGIDO, NÃO VALIDADO CONTRA A KIE.AI REAL (Lote 3).** Segredo compartilhado (`KIE_WEBHOOK_SECRET`) incluído na URL de callback e verificado no webhook; pulado com aviso se a variável não estiver configurada | `api/suno/webhook/route.js` | Confirmado |
| A-04 | **NÃO IMPLEMENTADO (decisão do usuário, Lote 3).** Continua sem rate limiting. Recomendação documentada no FIX_PLAN: Cloudflare Rate Limiting Rules no painel, sem necessidade de KV nem mudança de código | `api/suno/generate/route.js:7` | Confirmado |
| A-05 | **CORRIGIDO E VALIDADO (Lote 1, 2026-08-01)** — não testado contra origem real. SSRF + XSS em `/api/image-proxy`: busca URL arbitrária e repassa o `Content-Type` da origem, permitindo servir HTML no domínio do site. Corrigido com `src/lib/proxyAllowlist.js` (só HTTPS + host na allowlist) e validação do `Content-Type` de resposta (só `image/*`, `audio/*`, `application/octet-stream`) | `api/image-proxy/route.js:14-28` | Confirmado |
| A-06 | **CORRIGIDO E VALIDADO (Lote 1, 2026-08-01)** — não testado contra origem real. SSRF em `/api/audio/proxy` (URL absoluta arbitrária em `candidates`). Corrigido: a URL absoluta vinda do cliente só entra nos candidatos se o host estiver na allowlist; candidatos construídos a partir do `itemId` já eram domínios fixos seguros. `Access-Control-Allow-Origin: *` mantido (fora do escopo deste item — proxy só serve mídia, não HTML) | `api/audio/proxy/route.js:44,96` | Confirmado |
| A-07 | **CORRIGIDO E VALIDADO (Lote 2).** `/api/video/generate` agora responde 403 se `!hasVideoAccess && !videoAddonPaid` | `api/video/generate/route.js` | Confirmado |
| A-08 | **CORRIGIDO NO CÓDIGO, PENDENTE DE CONFIGURAÇÃO EXTERNA (Lote 3).** A decisão de autorização real já está no servidor desde o Lote 1 (`requireAdmin`, verificado por ID token); `src/lib/auth.js` agora também aceita custom claim `admin: true`, mas ninguém ainda rodou `scripts/set-admin-claim.mjs` (precisa de Admin SDK). A checagem de e-mail no browser citada aqui continua existindo, mas só como atalho de UX (redirecionar para `/admin/login`), não como controle de acesso | `admin/page.jsx:52`, `admin/pedidos/[id]/page.jsx:46` | Confirmado |
| A-09 | **CORRIGIDO E VALIDADO (Lote 2).** Aprovação inteira (não só a flag de WhatsApp) roda dentro de `runTransaction`, com `paymentId`/`videoPaymentId` como chave de dedupe — testado ("mesmo paymentId não processado duas vezes") | `src/lib/payments.js` | Confirmado |
| A-10 | **CORRIGIDO E VALIDADO (Lote 2).** `generatePixPayload` recebe um `txid` único por cobrança (gerado a partir do `orderId` + timestamp); com `txid` omitido, mantém o `***` antigo (compatibilidade) | `api/payments/create/route.js` | Confirmado |
| A-11 | **CORRIGIDO E VALIDADO (Lote 3).** `/api/orders/create` agora reforça o limite no servidor (`isBlockedByFreeLimit`, mesmo critério do `checkUserLimit` client-side) antes de criar o pedido, respondendo 403 se bloqueado — chamar a rota direto não ignora mais o limite | `api/orders/create/route.js`, `criar/page.jsx:799-853` | Confirmado |
| A-12 | **NÃO IMPLEMENTADO (decisão do usuário, Lote 3)** — mesma recomendação de A-04 | `api/whatsapp/verify/route.js:6` | Confirmado |
| A-13 | **CORRIGIDO E VALIDADO (Lote 2), com fallback.** `applyPaymentApproval` usa o `paymentIntentSku` persistido em `/api/payments/create`; heurística de valor mantida só como fallback para pedidos sem esse campo (criados antes desta mudança) | `src/lib/payments.js` | Confirmado |
| A-14 | Ausência total de testes, `typecheck` e CI; build e lint não executam no estado atual do repositório | `package.json:scripts` | Confirmado |

## 6. Problemas de pagamento — síntese

O fluxo de pagamento é a área mais frágil do sistema e concentra 5 dos 11 itens críticos.

| Requisito | Estado |
|---|---|
| Confirmação no servidor | Parcial — existe (reconsulta ao MP) mas é contornável por C-01 e C-02 |
| Confiança indevida no frontend | **Falha** — preço (C-05), status (C-01) e limite de uso (A-11) |
| Assinatura do webhook | **Falha** (A-01) |
| Idempotência | **Falha** — sem chave de idempotência; flags sem transação (A-09) |
| Valor cobrado × produto liberado | **Falha** (C-09, C-05) |
| Associação pagamento ↔ pedido | **Falha** — PIX estático sem `txid` (A-10) |
| Estados cancelado/estornado | **Ausente** — apenas `approved` é tratado; um estorno nunca revoga o acesso |
| Webhooks fora de ordem | Não tratado — não há comparação de timestamp nem de versão |
| Concorrência | **Falha** — webhook e polling executam a mesma lógica sem lock |
| Vocabulário de status | Inconsistente — `AGUARDANDO_PAGAMENTO` (criação), `PAGAMENTO_APROVADO` (servidor), `PAGO` (cliente), `PENDENTE` (documentado em `.agents/`, nunca escrito) |

## 7. Problemas de banco de dados (MÉDIA)

| ID | Título | Referência |
|---|---|---|
| M-01 | **CORRIGIDO NO CÓDIGO, MIGRAÇÃO DE DADOS PENDENTE DE AUTORIZAÇÃO (Lote 2).** O código só escreve mais `PAGAMENTO_APROVADO`; leitura ainda aceita `PAGO` para compatibilidade com pedidos antigos. Script de migração preparado (`scripts/migrate-payment-status.mjs`, com reversão) mas **não executado** — precisa de credenciais reais e autorização | `orders/create:31` vs `src/lib/payments.js` |
| M-02 | **CORRIGIDO E VALIDADO (Lote 5).** `generateUniqueOrderNumber()` combina timestamp+aleatório+ano real e confere unicidade no Firestore antes de aceitar (até 5 tentativas + fallback de alta entropia) | `api/orders/create/route.js` | Confirmado |
| M-03 | **CORRIGIDO E VALIDADO (Lote 1 + Lote 5).** `minhas-musicas:93` resolvido no Lote 1 (C-08). `orders/search`: busca por `orderId` em `suno_tasks` agora usa `where`; busca por substring em `orders` (não dá para fazer só com `where`) limitada a `orderBy('createdAt','desc')` + `limit(300)` em vez de ler tudo | `api/orders/search/route.js` | Confirmado |
| M-04 | **PARCIALMENTE CORRIGIDO (Lotes 2 e 5).** `src/lib/payments.js:applyPaymentApproval` (Lote 2) e `src/lib/db.js:updateTaskResult` (Lote 5, envio de WhatsApp) agora usam `runTransaction`. Resto do `src/` continua sem transações onde `.agents/AGENTS.md` §8 exigiria | resto do `src/` |
| M-05 | **CORRIGIDO E VALIDADO (Lote 5).** `firestore.indexes.json` criado — as queries atuais só precisam de índices de campo único (automáticos no Firestore); o arquivo documenta isso e serve de base para índices compostos futuros | `firestore.indexes.json` | Confirmado |
| M-06 | **CORRIGIDO E VALIDADO (Lote 5).** `saveTask` agora usa `merge: true`, igual `updateTaskResult`. Corrigida também uma corrida de leitura-depois-escrita no envio de WhatsApp de `updateTaskResult` (mesma classe do A-09), descoberta ao revisar esta função | `lib/db.js` | Confirmado |
| M-07 | **CORRIGIDO E VALIDADO (Lote 5).** `/api/orders/delete` grava `deletedAt` (exclusão lógica) e remove as `suno_tasks` associadas. Todos os pontos de leitura de `orders` conhecidos passaram a filtrar `deletedAt` | `orders/delete/route.js` + 5 arquivos de leitura | Confirmado |
| M-08 | **CORRIGIDO E VALIDADO (Lote 5).** `handleImageUpload` faz upload para o Firebase Storage (`canvas.toBlob` + `uploadBytes`) e salva só a URL — nunca mais base64 no Firestore nem no rascunho do `localStorage` (resolve M-14 como efeito colateral) | `criar/page.jsx` | Confirmado |
| M-09 | **CORRIGIDO E VALIDADO (Lote 5).** Listagem do admin usa `limit(pageSize + 1)` (50/página) com botão "Carregar mais" em vez de ler a coleção inteira | `admin/page.jsx` | Confirmado |

## 8. Problemas de frontend (MÉDIA / BAIXA)

| ID | Título | Referência | Sev. |
|---|---|---|---|
| M-10 | **CORRIGIDO E VALIDADO (Lote 4).** `pollIntervalRef` guarda o intervalo; limpo na desmontagem do componente e antes de cada nova chamada de `pollSunoStatus` | `criar/page.jsx` (`pollSunoStatus`) | MÉDIA |
| M-11 | **CORRIGIDO E VALIDADO (Lote 4).** `handleReviewSubmit` grava a avaliação via `updateDoc` e só mostra sucesso após confirmar a escrita; erro visível se falhar | `entrega/page.jsx` (`handleReviewSubmit`) | MÉDIA |
| M-12 | **CORRIGIDO E VALIDADO (Lote 4).** `buildSunoPayload` extraído para `src/lib/sunoPayload.js`, usado nos dois pontos de chamada — não diverge mais | `src/lib/sunoPayload.js` | MÉDIA |
| M-13 | **CORRIGIDO E VALIDADO (Lote 4).** Checkbox real adicionado (step 9 de `criar/page.jsx`), obrigatório para avançar; `/api/orders/create` valida `termsAccepted === true` no servidor e persiste o campo + timestamp | `criar/page.jsx`, `api/orders/create/route.js` | MÉDIA |
| M-14 | **CORRIGIDO E VALIDADO (Lote 5, efeito colateral de M-08).** A capa deixou de ser base64 (agora é URL do Storage), então o rascunho no `localStorage` não carrega mais um blob gigante — a causa raiz do `QuotaExceededError` foi removida. O `catch` já loga com `console.warn` (não é totalmente silencioso, mas também não avisa o usuário — risco residual baixo) | `criar/page.jsx` | Confirmado |
| M-15 | **CORRIGIDO E VALIDADO (Lote 4).** Novo status `'unknown'` para falha de rede/resposta não-ok; `isPhoneValid()` só aceita `'valid'`, então a falha bloqueia o avanço em vez de liberar | `criar/page.jsx` | MÉDIA |
| M-16 | **CORRIGIDO E VALIDADO (Lote 1, como efeito colateral de C-08).** Confirmado no Lote 4 que não resta correspondência por substring — a busca usa `where` com igualdade exata | `minhas-musicas/page.jsx` | MÉDIA |
| M-17 | **CORRIGIDO E VALIDADO (Lote 4).** Bloco do link removido inteiramente de `acompanhar/page.jsx` | `acompanhar/page.jsx` | MÉDIA |
| B-01 | **CORRIGIDO E VALIDADO (Lote 4).** `CustomAudioPreview` guarda o `setTimeout` de retry em `retryTimerRef`, limpo na desmontagem | `criar/page.jsx` | BAIXA |
| B-02 | **PARCIALMENTE CORRIGIDO (Lote 6).** As 14 ocorrências de `/logo.png` migradas para `<Image>` (asset estático, sem risco). Fotos de cliente/capas via proxy/placeholder externo deixadas como `<img>` — precisam de `images.remotePatterns` no `next.config.mjs` e validação visual não feita nesta sessão | `criar`, `entrega`, `page.jsx` + 11 outros | BAIXA |
| B-03 | `catch(e => console.warn(e))` engolindo falhas de escrita sem feedback ao usuário | `entrega/page.jsx:92,202,336,385` | BAIXA |
| B-04 | `getFriendlyAuthErrorMessage` duplicado literalmente em dois arquivos | `login/page.jsx`, `minhas-musicas/page.jsx` | BAIXA |

## 9. Problemas de arquitetura e dívida técnica

| ID | Título | Referência | Sev. |
|---|---|---|---|
| M-18 | **CORRIGIDO E VALIDADO (Lote 2).** Unificado em `src/lib/payments.js:applyPaymentApproval`, consumido pelos dois arquivos — não há mais lógica duplicada nem divergência de `paidAt` | `src/lib/payments.js` | MÉDIA |
| M-19 | Mensagem de WhatsApp montada em 3 lugares diferentes com texto quase idêntico | `lib/db.js:129`, `webhooks/mercadopago:159`, `payments/status:169` | MÉDIA |
| M-20 | **PARCIALMENTE CORRIGIDO (Lote 7), NÃO VALIDADO VISUALMENTE.** `criar/page.jsx`: 2.848→1.788 linhas (extraídos `wizardStyles.js`, `wizardOptions.js`, `CustomAudioPreview.jsx`, `WizardSteps.jsx` — passos 1-9). `entrega/page.jsx`: 1.442→1.263 linhas (`entregaStyles.js`). Os trechos mais críticos (checkout/pagamento, polling do Suno, upload de vídeo) foram deixados nos arquivos principais por decisão de risco — ver FIX_PLAN Lote 7 | `criar/page.jsx`, `entrega/page.jsx` | Confirmado |
| B-05 | `'use client'` + `export const runtime = 'edge'` no mesmo arquivo, proibido por `.agents/AGENTS.md` §3 | `admin/pedidos/[id]/page.jsx:1-2` | BAIXA |
| B-06 | Número de WhatsApp do administrador embutido no código | `webhooks/mercadopago/route.js:169` | BAIXA |
| B-07 | Código morto: `HomenagemPublica.jsx` (434 linhas, órfão), `lib/sunoToken.js` (sem chamadores), `gerar-logs-pagbank.js` (raiz), `addonsConfig`/`packagesList` (`criar/page.jsx:516-534`) | vários | BAIXA |
| B-08 | **CORRIGIDO E VALIDADO (Lote 6).** Timeout adicionado aos 5 `fetch` externos restantes sem ele (Kie.ai, OpenAI, W-API); retry com backoff exponencial na consulta ao Mercado Pago dentro do webhook | `lib/gemini.js`, `lib/whatsapp.js`, `api/suno/*`, `api/webhooks/mercadopago` | Confirmado |
| B-10 | **CORRIGIDO E VALIDADO (Lote 0, 2026-08-01).** 6 rotas Edge importavam `@/lib/firebase` (SDK completo, com `getAuth`) em vez de `@/lib/firebase-edge` (`firestore/lite`), violando `.claude/rules/backend.md` — e, consequentemente, importavam as funções do Firestore (`collection`, `doc`, `getDoc(s)`, `updateDoc`, `deleteDoc`, `addDoc`, `query`, `where`) do pacote completo `firebase/firestore` em vez de `firebase/firestore/lite`, incompatível com a instância lite usada para acessá-las. Não detectado no relatório original porque `node_modules` estava quebrado e o build nunca chegou a essa fase. Quebrava `next build` com `FirebaseError: auth/invalid-api-key` ao coletar dados da página de `/api/orders/delete`. Corrigido trocando os imports nas 6 rotas (mesmas variáveis/funções, sem mudança de lógica) | `api/orders/{create,delete,search,update}/route.js`, `api/video/generate/route.js`, `api/whatsapp/notify/route.js` | MÉDIA |

## 10. Problemas de qualidade, dependências e configuração

| ID | Título | Evidência | Sev. |
|---|---|---|---|
| M-21 | **PARCIALMENTE CORRIGIDO (Lote 7) — PENDENTE DE DECISÃO.** `firebase` atualizado para 10.14.1 (patch, sem breaking change). As 12 vulnerabilidades restantes (todas via `undici`) só são resolvidas com `firebase` v11 — major bump com risco de incompatibilidade, não executado sem autorização explícita | cadeia `undici` (via `@firebase/*`) | Confirmado |
| M-22 | **CORRIGIDO E VALIDADO (Lote 7).** Dependência `mercadopago` removida — reduziu `npm audit` de 23 para 12 vulnerabilidades | `package.json` | Confirmado |
| M-23 | **CORRIGIDO E VALIDADO (Lote 8).** `.env.example` reescrito: adicionados `KIE_API_KEY`, `WAPI_TOKEN`, `WAPI_INSTANCE_ID`, `OPENAI_API_KEY`; removidos `PAGBANK_TOKEN`/`PAGBANK_ENV` (confirmado sem uso) | `.env.example` | Confirmado |
| M-24 | **CORRIGIDO E VALIDADO (Lote 8).** `.gitignore` agora cobre `.env` além de `.env*.local` | `.gitignore` | Confirmado |
| M-25 | **CORRIGIDO E VALIDADO (Lote 8).** `lib/db.js` e `whatsapp/notify/route.js` não logam mais `customerPhone` — usam `orderId` como identificador | `lib/db.js`, `api/whatsapp/notify/route.js` | Confirmado |
| M-26 | **CORRIGIDO E VALIDADO (Lote 8).** `lib/whatsapp.js` não loga mais `instanceId`, tamanho/prefixo de token, nem o número de telefone (usa índice da tentativa) | `lib/whatsapp.js` | Confirmado |
| B-09 | **JÁ RESOLVIDO NO LOTE 0.** `.eslintrc.json` único, sem `eslint.config.js` nem `eslintConfig` duplicado | raiz | Confirmado |

---

## 11. Comandos executados

| Comando | Resultado |
|---|---|
| `git ls-files`, `git status` | 64 arquivos versionados; working tree limpo em `29400f4` |
| `npm audit --omit=dev` | **14 vulnerabilidades** (3 altas, 11 moderadas) |
| `node -v` / `npm -v` | v24.18.1 / 11.16.0 |
| `npm run lint` | **Falhou** — `Cannot find module .../node_modules/next/dist/bin/next` |
| `npm run build` | **Falhou** — mesmo erro; `node_modules/next` ausente |
| `grep` por segredos, `process.env`, `TODO`, `runtime`, símbolos | ver seções acima |

`node_modules` está incompleto (apenas `@firebase` no primeiro nível). Não foi executado `npm ci` por
se tratar de auditoria em modo somente leitura.

## 12. Limitações da auditoria

Esta auditoria **não encontrou todos os bugs** do sistema. Cobertura e lacunas:

**Cobertura alcançada**
- 100% das 15 rotas de API e dos 7 módulos de `src/lib/` foram lidos integralmente.
- 100% das páginas foram analisadas (as duas maiores por subagente especializado).
- Configuração, dependências, variáveis de ambiente e histórico recente de commits: revisados.

**Não pôde ser validado**
1. **Regras do Firestore** (C-11) — não estão no repositório. É a maior incógnita e determina se o
   sistema já está exposto na prática ou apenas potencialmente.
2. **Build, lint e tipos** — `node_modules` quebrado impediu qualquer verificação estática ou de
   compilação. Podem existir erros que só apareceriam no build.
3. **Comportamento em execução** — nada foi executado contra produção ou sandbox. Todas as
   explorações descritas são derivadas de leitura de código, não de exploração ativa.
4. **Variáveis de ambiente reais** — apenas nomes foram inspecionados; nenhum valor foi lido, copiado
   ou registrado.
5. **Configuração do Cloudflare Pages** — headers, WAF, rate limiting de borda e variáveis de ambiente
   ficam fora do repositório e podem mitigar (ou agravar) parte dos achados.
6. **Contratos das APIs externas** — o comportamento de Kie.ai, W-API e Mercado Pago foi inferido do
   código de integração, não de suas documentações oficiais.
7. **`src/lib/videoGenerator.js`** (349 linhas) foi analisado apenas parcialmente; a lógica de
   renderização Canvas/MediaRecorder merece revisão dedicada.

**Conclusão sobre confiança:** os 11 itens críticos são todos *Confirmados* por leitura direta do
código, exceto C-11, que é confirmado quanto à arquitetura e depende de verificação externa quanto ao
impacto real. Nenhum achado deste relatório foi verificado por execução.
