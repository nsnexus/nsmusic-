# Plano de Implementação: Robô Local Suno (Worker Desktop) + Failover NSMusic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir um robô local em Node.js com Playwright que roda no Windows do estúdio para gerar músicas direto no Suno.com com a assinatura oficial do usuário, enviar os MP3 para o Cloudflare R2 e integrá-lo ao NSMusic com failover automático para a Kie.ai após 3 minutos.

**Architecture:** O robô opera em um subprojeto isolado (`local-worker/`) na raiz do repositório. Ele roda via `iniciar-robo.bat`, consulta o Supabase a cada 4s, automatiza o `suno.com/create` com perfil Chrome persistente, intercepta as URLs de áudio brutas da CDN (`cdn1.suno.ai`), sobe para o Cloudflare R2 e atualiza o pedido. No Next.js, se o robô estiver desligado por > 3 minutos, a rota `/api/suno/status` desvia automaticamente para a Kie.ai.

**Tech Stack:** Node.js, Playwright (Chromium persistent context), @supabase/supabase-js, Next.js 14 (App Router, Edge Runtime), Cloudflare R2.

**Spec:** [`docs/superpowers/specs/2026-10-07-suno-local-worker-design.md`](file:///c:/Users/narci/OneDrive/Documentos/PROJETOS/nsmusic/docs/superpowers/specs/2026-10-07-suno-local-worker-design.md)

## Global Constraints

- O subprojeto `local-worker/` deve ser 100% isolado, com `package.json` próprio, sem afetar o bundle do Next.js nem o deploy do Cloudflare Pages.
- O projeto Next.js principal (`src/`) deve passar em `npm test` e `npm run build` após todas as alterações.
- Sem Tailwind no frontend do Next.js (inline styles + `globals.css`).
- As credenciais da pasta `./perfil-chrome` e `.env` do robô devem ser estritamente ignoradas no `.gitignore`.
- O tempo limite de failover para a Kie.ai é de exatamente 180 segundos (3 minutos) a partir da criação do pedido.

## Review Focus

1. **Expiração do robô / PC desligado:** Teste de failover para Kie.ai quando o pedido atinge 180s sem conclusão local.
2. **CDN Suno / Áudio Vazio:** Verificação de tamanho mínimo do buffer de áudio baixado (> 100 KB) antes do upload no R2.
3. **Isolamento de dependências:** Garantir que o Next.js não tente compilar arquivos de `local-worker/` no build de produção.
4. **Persistência de Perfil do Chrome:** Garantir que a pasta `perfil-chrome` armazene a sessão entre reinicializações do script.
5. **Idempotência de Pedidos:** Garantir que dois ciclos do robô não tentem processar o mesmo pedido simultaneamente (trava de status `EM_PROCESSAMENTO`).

---

### Task 1: Scaffolding e Infraestrutura do `local-worker`

**Files:**
- Create: `local-worker/package.json`
- Create: `local-worker/.env.example`
- Create: `local-worker/.gitignore`
- Create: `local-worker/iniciar-robo.bat`
- Modify: `.gitignore`

**Interfaces:**
- Produces: ambiente Node.js isolado com Playwright e Supabase client no diretório `local-worker/`.

- [ ] **Step 1: Criar `local-worker/package.json`** com dependências `playwright`, `@supabase/supabase-js`, `dotenv`.
- [ ] **Step 2: Atualizar o `.gitignore` raiz** para ignorar `local-worker/node_modules/`, `local-worker/.env` e `local-worker/perfil-chrome/`.
- [ ] **Step 3: Criar `local-worker/.env.example`** com `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `NSMUSIC_API_URL`.
- [ ] **Step 4: Criar `local-worker/iniciar-robo.bat`** com script de verificação do Node.js, `npm install` condicional e execução de `node robo-suno.js`.
- [ ] **Step 5: Executar `npm run build` na raiz** para provar que a pasta `local-worker/` não afeta o build do Next.js.
- [ ] **Step 6: Commit**
```bash
git add local-worker/package.json local-worker/.env.example local-worker/.gitignore local-worker/iniciar-robo.bat .gitignore
git commit -m "feat(local-worker): scaffolding inicial do worker desktop do suno"
```

---

### Task 2: Automação do Navegador Playwright (`local-worker/suno-automator.js`)

**Files:**
- Create: `local-worker/suno-automator.js`

**Interfaces:**
- Produces: função `gerarMusicaNoSuno({ prompt, style, title, onProgress }) -> Promise<{ success: boolean, clips: Array<{ id: string, audioUrl: string, title: string }> }>`

- [ ] **Step 1: Implementar inicialização de contexto persistente** no Playwright com `chromium.launchPersistentContext('./perfil-chrome')`.
- [ ] **Step 2: Implementar verificação de login** no `suno.com`: se o usuário não estiver logado, loga aviso no console e aguarda até o usuário completar o login.
- [ ] **Step 3: Implementar navegação e preenchimento de campos**: ativa o switch "Custom", preenche "Lyrics", "Style of Music", "Title" e aciona o botão "Create".
- [ ] **Step 4: Implementar interceptação de rede**: escuta chamadas `https://studio-api.suno.ai/api/feed/` ou polling do DOM para capturar os 2 novos clipes e aguardar status `complete`.
- [ ] **Step 5: Extrair as URLs da CDN** no padrão `https://cdn1.suno.ai/[id].mp3`.
- [ ] **Step 6: Commit**
```bash
git add local-worker/suno-automator.js
git commit -m "feat(local-worker): automacao do navegador suno.com via playwright"
```

---

### Task 3: Download da CDN e Upload Direto para o Cloudflare R2 (`local-worker/r2-uploader.js`)

**Files:**
- Create: `local-worker/r2-uploader.js`

**Interfaces:**
- Produces: `uploadAudioParaR2({ audioUrl, orderId, clipIndex }) -> Promise<{ ok: boolean, r2Url: string }>`

- [ ] **Step 1: Implementar download do buffer de áudio** a partir da URL da CDN (`cdn1.suno.ai/[id].mp3`) com validação de tamanho mínimo (100 KB).
- [ ] **Step 2: Implementar envio do buffer para o NSMusic** via rota `/api/admin/voice/upload` (usando `FormData` com pasta `audios-suno-local`), retornando a URL pública definitiva no Cloudflare R2.
- [ ] **Step 3: Adicionar retry** com tolerância a falhas transitórias de rede.
- [ ] **Step 4: Commit**
```bash
git add local-worker/r2-uploader.js
git commit -m "feat(local-worker): downloader de CDN e uploader de audios para Cloudflare R2"
```

---

### Task 4: Polling e Ciclo de Vida do Robô (`local-worker/robo-suno.js`)

**Files:**
- Create: `local-worker/robo-suno.js`

**Interfaces:**
- Consumes: `suno-automator.js`, `r2-uploader.js`.
- Produces: executável principal em Node.js com loop de polling e atualização de pedidos no Supabase.

- [ ] **Step 1: Inicializar cliente Supabase** em `robo-suno.js` usando credenciais de `.env`.
- [ ] **Step 2: Implementar Heartbeat periódico**: a cada 30 segundos, atualiza o timestamp em `config` ou registra presença do worker.
- [ ] **Step 3: Implementar busca de tarefas pendentes**: consulta pedidos com `sunoProvider = 'suno_local'` e `status = 'GERANDO'` (sem áudio gerado).
- [ ] **Step 4: Implementar bloqueio atômico**: ao assumir um pedido, marca `status_robo = 'PROCESSANDO'` para evitar duplicidade.
- [ ] **Step 5: Orquestrar fluxo**: chama `gerarMusicaNoSuno()`, para cada clipe chama `uploadAudioParaR2()`, e salva as URLs do R2 em `musicUrl` e `musicUrl2` no Supabase com `status = 'CONCLUIDO'`.
- [ ] **Step 6: Tratamento de exceções e moderação**: em caso de erro no Suno (ex: sem créditos ou letra rejeitada), marca `status_robo = 'FALHA_LOCAL'` com a mensagem de erro para o servidor assumir o failover.
- [ ] **Step 7: Commit**
```bash
git add local-worker/robo-suno.js
git commit -m "feat(local-worker): loop de polling e orquestrador principal do worker"
```

---

### Task 5: Roteamento de Geração e Failover Automático no NSMusic

**Files:**
- Modify: `src/lib/suno.js`
- Modify: `src/app/api/suno/status/route.js`
- Test: `tests/unit/suno-local-failover.test.js`

**Interfaces:**
- Consumes: pedidos no Supabase com `sunoProvider = 'suno_local'`.
- Produces: failover para `gerarPelaKie` quando tempo decorrido > 180s.

- [ ] **Step 1: Escrever teste unitário falhando** `tests/unit/suno-local-failover.test.js`:
  - Testa que pedido com `sunoProvider: 'suno_local'` há mais de 180s dispara `gerarPelaKie`.
  - Testa que pedido com `sunoProvider: 'suno_local'` há menos de 180s continua aguardando o robô.
- [ ] **Step 2: Rodar teste e confirmar falha**:
  `npx vitest run tests/unit/suno-local-failover.test.js`
- [ ] **Step 3: Atualizar `src/lib/suno.js`**:
  - Aceita `suno_local` como opção de provedor.
  - Ao iniciar pedido com `suno_local`, persiste em `orders` com `sunoProvider: 'suno_local'` e `status: 'GERANDO'`.
- [ ] **Step 4: Atualizar `src/app/api/suno/status/route.js`**:
  - Se `order.sunoProvider === 'suno_local'`:
    - Se já tiver faixas salvas pelo robô, retorna `COMPLETED`.
    - Se decorridos > 180 segundos sem faixas (ou se `status_robo === 'FALHA_LOCAL'`), aciona failover automático chamando `gerarPelaKie`, atualiza `sunoProvider: 'kie'` e retorna status de transição.
- [ ] **Step 5: Rodar testes unitários e verificar aprovação**:
  `npx vitest run tests/unit/suno-local-failover.test.js`
- [ ] **Step 6: Commit**
```bash
git add src/lib/suno.js src/app/api/suno/status/route.js tests/unit/suno-local-failover.test.js
git commit -m "feat(suno): suporte a provedor local e failover automatico de 3min para Kie.ai"
```

---

### Task 6: Painel Admin - Seletor de Provedor e Indicador de Presença do Robô

**Files:**
- Modify: `src/app/api/admin/config/route.js`
- Modify: `src/app/admin/page.jsx`

**Interfaces:**
- Produces: toggle de provedor primário (`kie`, `unifically`, `suno_local`) e badge de status do robô no painel admin.

- [ ] **Step 1: Atualizar `api/admin/config/route.js`** para permitir salvar `suno_provider_primary: 'suno_local' | 'kie' | 'unifically'` e consultar o último heartbeat registrado pelo robô.
- [ ] **Step 2: Atualizar `src/app/admin/page.jsx`** para incluir:
  - Botão seletor de Provedor Primário com a opção "Suno Local (PC)".
  - Card visual exibindo o status do Robô Local:
    - 🟢 "Robô Local Conectado (visto há X seg)" se heartbeat < 60s.
    - 🔴 "Robô Local Desconectado (Kie.ai assumirá os pedidos)" se heartbeat >= 60s.
- [ ] **Step 3: Executar `npm test` e `npm run build`** para garantir que a UI e as rotas compilam perfeitamente sem erros de lint.
- [ ] **Step 4: Commit**
```bash
git add src/app/api/admin/config/route.js src/app/admin/page.jsx
git commit -m "feat(admin): seletor de provedor suno local e status do worker em tempo real"
```

---

### Task 7: Verificação Completa e Build de Produção

**Files:**
- Test: todo o repositório (`npm test` e `npm run build`)
- Create: `local-worker/README.md` (instruções passo a passo de como rodar no Windows)

- [ ] **Step 1: Criar `local-worker/README.md`** detalhando como clonar/rodar, como funciona a primeira autenticação no Suno e como verificar os logs.
- [ ] **Step 2: Executar bateria de testes completa**: `npm test` (todos os 70+ arquivos de testes devem passar).
- [ ] **Step 3: Executar build de produção do Next.js**: `npm run build`.
- [ ] **Step 4: Commit e Push**:
```bash
git add local-worker/README.md
git commit -m "docs(local-worker): guia de instalacao e operacao do worker suno"
git push origin master
```
