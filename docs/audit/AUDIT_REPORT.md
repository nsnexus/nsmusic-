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
| **CRÍTICA** | 11 | Vulnerabilidade, bug confirmado de receita |
| **ALTA** | 14 | Vulnerabilidade, risco arquitetural, bug confirmado |
| **MÉDIA** | 20 | Dívida técnica, bug provável, performance |
| **BAIXA** | 8 | Dívida técnica, melhoria |
| **Total** | **53** | |

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
  — isso só é resolvido com acesso ao console do Firebase, fora do alcance desta sessão.

---

## 5. Problemas de segurança (ALTA)

| ID | Título | Arquivo:símbolo | Confiança |
|---|---|---|---|
| A-01 | Webhook do Mercado Pago sem validação de assinatura (`x-signature`). Mitigado pela reconsulta à API do MP, mas permite acionamento forçado e não verifica origem | `api/webhooks/mercadopago/route.js:192` (`POST`) | Confirmado |
| A-02 | `GET /api/suno/status?orderId=` usa `orderId` do cliente como `overrideOrderId`, gravando o áudio de uma tarefa no pedido de outro cliente | `api/suno/status/route.js:63` → `lib/db.js:85` (`updateTaskResult`) | Confirmado |
| A-03 | `POST /api/suno/webhook` sem autenticação ou assinatura | `api/suno/webhook/route.js:6` | Confirmado |
| A-04 | `POST /api/suno/generate` sem autenticação nem rate limiting: consumo ilimitado de créditos pagos da Kie.ai por terceiros | `api/suno/generate/route.js:7` | Confirmado |
| A-05 | **CORRIGIDO E VALIDADO (Lote 1, 2026-08-01)** — não testado contra origem real. SSRF + XSS em `/api/image-proxy`: busca URL arbitrária e repassa o `Content-Type` da origem, permitindo servir HTML no domínio do site. Corrigido com `src/lib/proxyAllowlist.js` (só HTTPS + host na allowlist) e validação do `Content-Type` de resposta (só `image/*`, `audio/*`, `application/octet-stream`) | `api/image-proxy/route.js:14-28` | Confirmado |
| A-06 | **CORRIGIDO E VALIDADO (Lote 1, 2026-08-01)** — não testado contra origem real. SSRF em `/api/audio/proxy` (URL absoluta arbitrária em `candidates`). Corrigido: a URL absoluta vinda do cliente só entra nos candidatos se o host estiver na allowlist; candidatos construídos a partir do `itemId` já eram domínios fixos seguros. `Access-Control-Allow-Origin: *` mantido (fora do escopo deste item — proxy só serve mídia, não HTML) | `api/audio/proxy/route.js:44,96` | Confirmado |
| A-07 | `POST /api/video/generate` não verifica `hasVideoAccess`/`videoAddonPaid` — add-on de R$ 6,90 obtido de graça | `api/video/generate/route.js:19-32` | Confirmado |
| A-08 | Autorização de admin por comparação de string de e-mail no browser | `admin/page.jsx:52`, `admin/pedidos/[id]/page.jsx:46` | Confirmado |
| A-09 | Sem transação na marcação de envio de WhatsApp (ler-depois-escrever): webhook e polling concorrentes causam mensagens duplicadas | `webhooks/mercadopago:135-150`, `payments/status:149-158` | Confirmado |
| A-10 | `POST /api/payments/create` não persiste nada; BR Code PIX é estático com `txid` fixo `***` — nenhum pagamento é conciliável automaticamente | `api/payments/create/route.js:14,40-41` | Confirmado |
| A-11 | Limite de 5 prévias grátis apenas em `localStorage` | `criar/page.jsx:799-853` (`checkUserLimit`) | Confirmado |
| A-12 | `POST /api/whatsapp/verify` sem rate limiting: oráculo de enumeração de números de WhatsApp | `api/whatsapp/verify/route.js:6` | Confirmado |
| A-13 | Distinção música/vídeo por heurística de valor (`Math.abs(amount - 6.90) < 0.01`): qualquer cobrança futura de R$ 6,90 é classificada como vídeo | `webhooks/mercadopago:107`, `payments/status:124` | Confirmado |
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
| M-01 | Divergência de enum em `paymentStatus` (4 valores distintos para 2 estados reais) | `orders/create:31` vs `webhooks/mercadopago:110` vs `criar/page.jsx:228` |
| M-02 | `orderNumber` gerado com 5 dígitos aleatórios (90.000 combinações), sem verificação de unicidade — colisões e enumeração | `orders/create/route.js:11` |
| M-03 | Varredura completa de coleção em toda busca (`getDocs` sem `where`/`limit`) — custo e latência crescem com a base | `orders/search:38`, `orders/search:16`, `minhas-musicas:93` |
| M-04 | Nenhuma transação no projeto, apesar de `.agents/AGENTS.md` §8 exigir `runTransaction` | todo o `src/` |
| M-05 | Sem índices, constraints ou chave única declarados; sem migrations | ausência de `firestore.indexes.json` |
| M-06 | `saveTask` usa `setDoc` sem `merge` e sobrescreve o documento; `updateTaskResult` usa `merge` — comportamento inconsistente | `lib/db.js:22` vs `:94` |
| M-07 | `suno_tasks` órfãs: nada remove tarefas de pedidos excluídos | `orders/delete/route.js` |
| M-08 | Capa em base64 armazenada dentro do documento Firestore (limite de 1 MiB por documento) | `criar/page.jsx:754-795` |
| M-09 | Sem paginação em nenhuma listagem, incluindo o painel admin (`onSnapshot` de toda a coleção) | `admin/page.jsx:80` |

## 8. Problemas de frontend (MÉDIA / BAIXA)

| ID | Título | Referência | Sev. |
|---|---|---|---|
| M-10 | `setInterval` de polling nunca limpo: continua rodando após desmontagem (até 6 min de fetches e escritas) | `criar/page.jsx:1109-1166` (`pollSunoStatus`) | MÉDIA |
| M-11 | Formulário de avaliação nunca persiste os dados, mas exibe estado de sucesso | `entrega/page.jsx:217-221` (`handleReviewSubmit`) | MÉDIA |
| M-12 | Botão "Tentar Novamente" envia payload diferente do original (perde `musicMood` e `voiceType`) | `criar/page.jsx:1814-1822` vs `:1073-1081` | MÉDIA |
| M-13 | `termsAccepted: true` fixo no código, sem checkbox — consentimento registrado sem ter sido pedido | `criar/page.jsx:288,886` | MÉDIA |
| M-14 | Rascunho com imagem base64 salvo em `localStorage` a cada tecla; `QuotaExceededError` silencioso | `criar/page.jsx:419-428` | MÉDIA |
| M-15 | Verificação de WhatsApp falha "aberta": erro de rede resulta em `valid` | `criar/page.jsx:356-363` | MÉDIA |
| M-16 | Busca por telefone com correspondência por substring bidirecional cruza clientes distintos | `minhas-musicas/page.jsx:105-113` | MÉDIA |
| M-17 | Link "Acessar Entrega Privada 🔑" com comentário `Secret admin preview link for demonstration` exibido a todos os clientes | `acompanhar/page.jsx:169-177` | MÉDIA |
| B-01 | Timers de retry do player não limpos na desmontagem | `criar/page.jsx:75-85` | BAIXA |
| B-02 | Uso generalizado de `<img>` em vez de `next/image` | `criar`, `entrega`, `page.jsx` | BAIXA |
| B-03 | `catch(e => console.warn(e))` engolindo falhas de escrita sem feedback ao usuário | `entrega/page.jsx:92,202,336,385` | BAIXA |
| B-04 | `getFriendlyAuthErrorMessage` duplicado literalmente em dois arquivos | `login/page.jsx`, `minhas-musicas/page.jsx` | BAIXA |

## 9. Problemas de arquitetura e dívida técnica

| ID | Título | Referência | Sev. |
|---|---|---|---|
| M-18 | Lógica de aprovação de pagamento duplicada em dois arquivos, já divergente (`paidAt` só existe em um) | `webhooks/mercadopago:82-125` vs `payments/status:117-139` | MÉDIA |
| M-19 | Mensagem de WhatsApp montada em 3 lugares diferentes com texto quase idêntico | `lib/db.js:129`, `webhooks/mercadopago:159`, `payments/status:169` | MÉDIA |
| M-20 | Componentes de 2.789 e 1.443 linhas, violando o limite de 400 de `.agents/AGENTS.md` §4 | `criar/page.jsx`, `entrega/page.jsx` | MÉDIA |
| B-05 | `'use client'` + `export const runtime = 'edge'` no mesmo arquivo, proibido por `.agents/AGENTS.md` §3 | `admin/pedidos/[id]/page.jsx:1-2` | BAIXA |
| B-06 | Número de WhatsApp do administrador embutido no código | `webhooks/mercadopago/route.js:169` | BAIXA |
| B-07 | Código morto: `HomenagemPublica.jsx` (434 linhas, órfão), `lib/sunoToken.js` (sem chamadores), `gerar-logs-pagbank.js` (raiz), `addonsConfig`/`packagesList` (`criar/page.jsx:516-534`) | vários | BAIXA |
| B-08 | Sem timeout nem retry controlado em nenhuma chamada `fetch` a serviço externo | todas as rotas de API | MÉDIA |
| B-10 | **CORRIGIDO E VALIDADO (Lote 0, 2026-08-01).** 6 rotas Edge importavam `@/lib/firebase` (SDK completo, com `getAuth`) em vez de `@/lib/firebase-edge` (`firestore/lite`), violando `.claude/rules/backend.md` — e, consequentemente, importavam as funções do Firestore (`collection`, `doc`, `getDoc(s)`, `updateDoc`, `deleteDoc`, `addDoc`, `query`, `where`) do pacote completo `firebase/firestore` em vez de `firebase/firestore/lite`, incompatível com a instância lite usada para acessá-las. Não detectado no relatório original porque `node_modules` estava quebrado e o build nunca chegou a essa fase. Quebrava `next build` com `FirebaseError: auth/invalid-api-key` ao coletar dados da página de `/api/orders/delete`. Corrigido trocando os imports nas 6 rotas (mesmas variáveis/funções, sem mudança de lógica) | `api/orders/{create,delete,search,update}/route.js`, `api/video/generate/route.js`, `api/whatsapp/notify/route.js` | MÉDIA |

## 10. Problemas de qualidade, dependências e configuração

| ID | Título | Evidência | Sev. |
|---|---|---|---|
| M-21 | `npm audit` reporta **14 vulnerabilidades (3 altas, 11 moderadas)** em dependências de produção | cadeia `undici` (via `@firebase/*`) e `uuid` (via `mercadopago`) | MÉDIA |
| M-22 | Dependência `mercadopago` declarada mas **nunca importada** — traz 3 das vulnerabilidades para nada | `package.json` vs `grep "from 'mercadopago'"` → 0 resultados | MÉDIA |
| M-23 | `.env.example` desatualizado: faltam `KIE_API_KEY`, `WAPI_TOKEN`, `WAPI_INSTANCE_ID`, `OPENAI_API_KEY`; sobram `PAGBANK_TOKEN`/`PAGBANK_ENV` (não usados no `src/`) | `.env.example` | MÉDIA |
| M-24 | `.gitignore` cobre `.env*.local` mas **não** `.env` — um `.env` na raiz seria commitado | `.gitignore:20-21` | MÉDIA |
| M-25 | PII (telefone do cliente) escrita em log de servidor | `lib/db.js:137,139`, `whatsapp/notify/route.js:46,49` | MÉDIA |
| M-26 | Prefixo do token e `instanceId` da W-API escritos em log | `lib/whatsapp.js:29,122` | MÉDIA |
| B-09 | `next lint` nunca foi configurado — não há `.eslintrc*` no repositório | raiz | BAIXA |

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
