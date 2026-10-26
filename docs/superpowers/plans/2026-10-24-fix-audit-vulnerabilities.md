# Plano de Implementação: Correção Integral da Auditoria NS Music

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminar todas as vulnerabilidades de segurança, fraude financeira, perda de dados e concorrência identificadas na auditoria do NS Music (S01-S11, D01-D12, F01-F08) sem introduzir regressões, validando cada etapa com testes unitários e build de produção antes de qualquer publicação no Git.

**Architecture:** A aplicação roda em Next.js 14 App Router sobre Cloudflare Pages Edge Runtime (`@cloudflare/next-on-pages`) integrado com Supabase (Postgres) e Cloudflare R2 para mídias. As correções devem respeitar estritamente o Edge Runtime (sem módulos nativos Node incompatíveis), idempotência transacional de pagamentos (Efí Bank / Stripe) e armazenamento imutável no R2.

**Tech Stack:** Next.js 14 App Router, JavaScript puro, Vitest, Supabase PostgREST Edge, Cloudflare R2, Efí Bank PIX SDK / Stripe REST API.

**Spec:** Auditoria do NS Music de 24/10/2026 (`docs/audit/AUDIT_2026-10-24.md`).

## Global Constraints

- Nunca hardcodar segredos, nem como fallback (`process.env.X || 'valor'`).
- Nunca usar classes do Tailwind CSS; manter estilização inline e `globals.css`.
- Todas as rotas de API em `src/app/api/` devem manter `export const runtime = 'edge'`.
- Comparações monetárias devem usar tolerância `Math.abs(a - b) < 0.01`.
- Não quebrar o fluxo legítimo de compra (PIX Efí e Stripe) nem a experiência do cliente na tela de entrega.
- Todas as alterações devem passar em `npm test` (89+ suítes) e `npm run build` antes de qualquer push.

## Review Focus

1. **Vazamento de áudio pré-pago:** A rota pública de pedido não pode expor URLs completas de áudio para pedidos não pagos, mas deve permitir que o player ouça a prévia autorizada.
2. **Idempotência de pagamento:** Repetições de polling ou webhooks da Efí/Stripe não podem gerar cobranças duplicadas ou aprovar pedidos incorretos.
3. **Fraude de comprovante:** Remoção da aprovação cega via IA sem consulta bancária real, redirecionando para validação humana ou via API.
4. **Sequestro de pedidos:** Bloqueio de edição arbitrária de telefone/e-mail em pedidos sem autenticação, impedindo a apropriação indevida via claim-code.
5. **Conversão do TikTok:** Correção imediata do `ReferenceError` em `criar/page.jsx` para garantir que compradores vindo do TikTok sejam redirecionados para `/entrega`.

---

### Task 1: [F01] Correção do Crash de Conversão TikTok em `/criar`
**Files:**
- Modify: `src/app/criar/page.jsx:115-135`
- Test: `tests/unit/tiktokPixel.test.js`

- [ ] **Step 1: Escrever teste unitário reproduzindo o cenário de aprovação com tracking TikTok**
- [ ] **Step 2: Rodar teste e constatar o erro ou validar cobertura**
- [ ] **Step 3: Corrigir `criar/page.jsx` definindo SKU padrão (`'audio_only'`) e isolando analytics em try/catch**
- [ ] **Step 4: Executar `npm test tests/unit/tiktokPixel.test.js` e verificar aprovação**

---

### Task 2: [S01] Revogação de Admin via `user_metadata`
**Files:**
- Modify: `src/lib/auth.js:29-38`
- Modify: `tests/unit/auth.test.js:91-105`

- [ ] **Step 1: Atualizar `tests/unit/auth.test.js` para rejeitar explicitamente `user_metadata.role === 'admin'` com 403**
- [ ] **Step 2: Rodar o teste para verificar a falha com o código atual**
- [ ] **Step 3: Modificar `src/lib/auth.js` removendo `user.user_metadata?.role === 'admin'`, mantendo apenas `app_metadata` e allowlist de e-mail verificado**
- [ ] **Step 4: Rodar `npm test tests/unit/auth.test.js` e verificar se passa**

---

### Task 3: [S02] Proteção contra Adulteração Anônima de Pedidos
**Files:**
- Modify: `src/app/api/orders/client-update/route.js:7-43`
- Create/Modify: `tests/unit/client-update-route.test.js`

- [ ] **Step 1: Criar teste garantindo que campos sensíveis (`customerPhone`, `customerEmail`, `total`, `audioUrl`, `productionStatus`, `audioFiles`) sejam rejeitados ou restritos a requisições com chave de posse do pedido**
- [ ] **Step 2: Remover campos sensíveis de `ALLOWED_CLIENT_FIELDS` em `client-update/route.js`**
- [ ] **Step 3: Rodar o teste e validar que clientes não autorizados não alteram dados de contato nem URLs de mídia**

---

### Task 4: [S03] Sanitização da Resposta Pública de Pedidos (`/api/orders/[id]`)
**Files:**
- Modify: `src/app/api/orders/[id]/route.js:40-56`
- Modify: `tests/unit/orderLookup.test.js`

- [ ] **Step 1: Escrever teste verificando que pedidos com status não pago (`AGUARDANDO_PAGAMENTO`, `PENDENTE`) não expõem `audioUrl`, `audioFiles` ou resultados integrais de `suno_tasks`**
- [ ] **Step 2: Implementar filtro de sanitização na rota `GET /api/orders/[id]`, removendo URLs de áudio final e PII sensível se o pedido não estiver pago**
- [ ] **Step 3: Rodar os testes e confirmar proteção**

---

### Task 5: [S04] Vínculo Estrito e Anti-Replay no Stripe Status
**Files:**
- Modify: `src/app/api/payments/status/route.js:84-103`
- Modify: `tests/unit/payments-status-route.test.js`

- [ ] **Step 1: Adicionar teste onde uma sessão Stripe de outro pedido tenta aprovar o pedido atual e é rejeitada**
- [ ] **Step 2: Alterar `status/route.js` para exigir `session.client_reference_id === orderId` ou `session.metadata?.orderId === orderId` antes de chamar `applyPaymentApproval`**
- [ ] **Step 3: Rodar `npm test tests/unit/payments-status-route.test.js` e validar**

---

### Task 6: [S05] Desativação da Auto-Aprovação Cega por Imagem OCR
**Files:**
- Modify: `src/app/api/payments/verify-receipt/route.js:70-110`
- Create/Modify: `tests/unit/verify-receipt-route.test.js`

- [ ] **Step 1: Escrever teste garantindo que envio de comprovante não invoca aprovação automática de pagamento sem conferência em API bancária**
- [ ] **Step 2: Alterar `verify-receipt/route.js` para salvar comprovante no pedido e marcar status para conferência manual (`AGUARDANDO_CONFERENCIA`), retornando que o comprovante foi recebido para análise**
- [ ] **Step 3: Validar teste**

---

### Task 7: [S06, S08] Proteção de Exclusão e Sobrescrita no R2
**Files:**
- Modify: `src/app/api/media/upload/route.js:93-121`
- Modify: `src/app/api/video/upload/route.js:20-65`
- Modify: `tests/unit/media-upload-route.test.js`

- [ ] **Step 1: Testes para rejeitar exclusão de arquivos fora do diretório temporário/fotos do cliente e rejeitar upload de vídeo sem pedido pago**
- [ ] **Step 2: Restringir `DELETE /api/media/upload` apenas a prefixos permitidos de fotos (`temp/`, `slideshow/`) com validação de formato e impedir deleção de `audios/` e `videos/`**
- [ ] **Step 3: Restringir `POST /api/video/upload` para verificar posse do pedido e direito pago ao vídeo (`hasVideoAccess === true`), usando nome versionado imutável**
- [ ] **Step 4: Executar testes de upload e mídia**

---

### Task 8: [S07, S09] Correção de Segredos e Fail-Closed nos Webhooks Efí e Stripe
**Files:**
- Modify: `src/app/api/webhooks/efi/route.js:10-18`
- Modify: `src/app/api/webhooks/stripe/route.js:27-35`, `65-73`
- Modify: `tests/unit/webhooks-efi.test.js`

- [ ] **Step 1: Adicionar teste no webhook Efí que rejeita o segredo hardcoded antigo e rejeita quando `EFI_WEBHOOK_SECRET` estiver ausente (fail closed)**
- [ ] **Step 2: Remover o segredo fixo `'b921ab7e69f76c320217395be846d34a97194cddc907687d'` e exigir segredo de ambiente válido**
- [ ] **Step 3: No webhook Stripe, exigir `STRIPE_WEBHOOK_SECRET` obrigatório para processar eventos e rejeitar caso a reconsulta à API falhe**
- [ ] **Step 4: Executar testes dos webhooks e confirmar aprovação**

---

### Task 9: [D01, D08] Propagação de Erros no SupabaseDb e Preservação de Provider
**Files:**
- Modify: `src/lib/supabaseDb.js:58-68`, `115-125`, `185-195`
- Modify: `src/lib/db.js:175-185`
- Modify: `tests/unit/supabaseDb.test.js`

- [ ] **Step 1: Testes garantindo que erro de escrita no Supabase lança exceção ou retorna `{ success: false, error }` em vez de falso sucesso**
- [ ] **Step 2: Atualizar `createOrder`, `updateOrder` e `saveTaskResult` em `supabaseDb.js` para propagar falhas reais e não sobrescrever `provider` com nulo quando ausente**
- [ ] **Step 3: Rodar `npm test tests/unit/supabaseDb.test.js`**

---

### Task 10: [D04, D06] Proteção contra Callbacks Tardios e Chaves de Áudio Imutáveis
**Files:**
- Modify: `src/lib/db.js:195-215`
- Modify: `src/lib/audioArchive.js:170-178`
- Modify: `tests/unit/updateTaskResult.test.js`
- Modify: `tests/unit/origensParaArquivar.test.js`

- [ ] **Step 1: Teste em `updateTaskResult.test.js` simulando chegada de callback de tarefa antiga quando o pedido já está com tarefa mais nova**
- [ ] **Step 2: Ajustar lógica de `db.js` para não regredir `audioUrl` nem `sunoTaskId` se a tarefa recebida for mais antiga que a atual**
- [ ] **Step 3: Ajustar `destPath` em `audioArchive.js` para usar hash/timestamp ou taskId na chave (`audios/${orderId}/${taskId || Date.now()}-v${i + 1}.mp3`) garantindo imutabilidade**
- [ ] **Step 4: Rodar testes de áudio e tarefas**

---

### Task 11: [D09, F02, F03, F05] Correções de IA, Microfone e Estado de Sessão
**Files:**
- Modify: `src/app/api/lyrics/generate/route.js:25-35`
- Modify: `src/components/VozClienteAddonCard.jsx:159-195`
- Modify: `src/app/criar/page.jsx:415-425`
- Modify: `src/app/conta/page.jsx:25-45`

- [ ] **Step 1: Em `lyrics/generate/route.js`, permitir execução quando `OPENAI_API_KEY` estiver configurada, mesmo sem Gemini**
- [ ] **Step 2: Em `VozClienteAddonCard.jsx`, adicionar `useEffect` de cleanup para parar `MediaStream` (tracks) e limpar `setInterval` na desmontagem**
- [ ] **Step 3: Em `criar/page.jsx`, aceitar parâmetro `novo=1` para limpar rascunho uniformemente**
- [ ] **Step 4: Em `conta/page.jsx`, não apagar estado de PIX pendente em eventos `TOKEN_REFRESHED`**

---

### Task 12: Validação Completa, Testes Finais e Build Geral
- [ ] **Step 1: Rodar suíte completa `npm test` (esperado: 89+ arquivos passando)**
- [ ] **Step 2: Rodar `npm run build` (esperado: compilação Next.js completa com sucesso)**
- [ ] **Step 3: Executar `npm run lint`**
- [ ] **Step 4: Apresentar resumo completo dos testes e diff ao usuário antes de qualquer ação no Git**
