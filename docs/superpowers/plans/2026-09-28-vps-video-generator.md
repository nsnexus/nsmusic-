# VPS Video Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o microserviço autocontido em `workers/video-generator/` para renderizar vídeos slideshow MP4 HD com FFmpeg na VPS, e adicionar o endpoint seguro com toggle `VPS_VIDEO_URL` no Next.js sem alterar o front-end em produção.

**Architecture:** O microserviço roda em Node.js com Express e FFmpeg nativo (suportando Docker e PM2). Recebe requisições autenticadas `POST /render`, processa o vídeo em fila assíncrona, faz upload direto para o Cloudflare R2 e atualiza o Supabase. O Next.js no Cloudflare Pages ganha o endpoint `/api/video/render` que só aciona a VPS se a variável `VPS_VIDEO_URL` estiver presente.

**Tech Stack:** Node.js 20, Express, FFmpeg (`libx264`, `aac`), `@aws-sdk/client-s3`, `@supabase/supabase-js`, Docker, Next.js 14 App Router (Edge Runtime).

**Spec:** [`docs/superpowers/specs/2026-09-28-vps-video-generator-design.md`](file:///c:/Users/01543230/Documents/NSMusic/docs/superpowers/specs/2026-09-28-vps-video-generator-design.md)

## Global Constraints

- O código em produção atual (`/entrega`, `/criar`, etc.) não deve sofrer alterações que quebrem o comportamento em execução no ar.
- Todo o código do worker na VPS deve ser autocontido dentro de `workers/video-generator/`.
- No Next.js, toda nova rota em `src/app/api/` deve declarar obrigatoriamente `export const runtime = 'edge'`.
- Nenhuma chave secreta deve ser hardcodada. Usar sempre variáveis de ambiente.
- O build (`npm run build`) do projeto Next.js principal deve continuar passando 100% verde.

---

### Task 1: Scaffolding e Infraestrutura Docker do Worker (`workers/video-generator`)

**Files:**
- Create: `workers/video-generator/package.json`
- Create: `workers/video-generator/.env.example`
- Create: `workers/video-generator/Dockerfile`
- Create: `workers/video-generator/docker-compose.yml`
- Create: `workers/video-generator/README.md`

**Interfaces:**
- Produz: Estrutura base de dependências e container para o microserviço.

- [ ] **Step 1: Criar package.json do worker**
Definir scripts (`start`, `dev`, `test`) e dependências essenciais (`express`, `@aws-sdk/client-s3`, `@supabase/supabase-js`, `dotenv`).

- [ ] **Step 2: Criar Dockerfile com FFmpeg**
Utilizar imagem base `node:20-alpine` ou `node:20-slim`, instalando `ffmpeg`, `fonts-freefont-ttf` e dependências necessárias.

- [ ] **Step 3: Criar docker-compose.yml e .env.example**
Configurar mapeamento de portas (`PORT: 3100`), variáveis de ambiente e volumes temporários.

- [ ] **Step 4: Criar README.md inicial**
Documentar pré-requisitos na VPS (Docker ou Node.js 20 + FFmpeg) e comandos de execução.

---

### Task 2: Módulo de Download e Gerenciamento Temporário (`src/downloader.js`)

**Files:**
- Create: `workers/video-generator/src/downloader.js`
- Create: `workers/video-generator/tests/downloader.test.js`

**Interfaces:**
- Produz: `downloadJobAssets(orderId, imageUrls, audioUrl)` -> `{ workDir, imageFiles, audioFile, cleanup }`

- [ ] **Step 1: Escrever teste unitário para downloader**
Testar criação de pasta temporária única, download mockado e função de cleanup.

- [ ] **Step 2: Implementar downloader.js**
Baixar imagens e MP3 em paralelo usando streams do Node.js, com timeout e retries.

- [ ] **Step 3: Executar testes do downloader**
Garantir que a função remove a pasta temporária após chamada de `cleanup()`.

---

### Task 3: Pipeline de Renderização FFmpeg (`src/ffmpegRunner.js`)

**Files:**
- Create: `workers/video-generator/src/ffmpegRunner.js`
- Create: `workers/video-generator/tests/ffmpegRunner.test.js`

**Interfaces:**
- Consumes: `{ workDir, imageFiles, audioFile }`
- Produz: `renderSlideshowVideo({ imageFiles, audioFile, outputFilePath, onProgress })` -> Promise<{ outputPath, duration }>

- [ ] **Step 1: Escrever teste para construção do comando FFmpeg**
Verificar se os argumentos gerados pelo runner contêm `720:1280`, `libx264`, `aac`, `yuv420p` e `-movflags +faststart`.

- [ ] **Step 2: Implementar ffmpegRunner.js**
Montar comando `ffmpeg` executado via `child_process.spawn`, calculando a duração por foto baseada na duração do áudio e gerando o arquivo MP4 final.

- [ ] **Step 3: Executar teste de validação de argumentos**
Garantir que o script trata erros de execução do FFmpeg e captura logs de stderr.

---

### Task 4: Upload para Cloudflare R2 (`src/r2Uploader.js`)

**Files:**
- Create: `workers/video-generator/src/r2Uploader.js`
- Create: `workers/video-generator/tests/r2Uploader.test.js`

**Interfaces:**
- Consumes: `{ filePath, orderId }`
- Produz: `uploadVideoToR2(filePath, orderId)` -> Promise<string> (URL pública do MP4 no R2)

- [ ] **Step 1: Escrever teste para r2Uploader**
Testar chamada de `PutObjectCommand` do `@aws-sdk/client-s3` com o bucket, key e Content-Type corretos.

- [ ] **Step 2: Implementar r2Uploader.js**
Configurar o cliente S3 para Cloudflare R2 com `endpoint: https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.

- [ ] **Step 3: Executar testes do uploader**
Garantir que retorna a URL pública concatenada corretamente (`${R2_PUBLIC_URL}/videos/...`).

---

### Task 5: Atualização do Pedido no Supabase (`src/orderUpdater.js`)

**Files:**
- Create: `workers/video-generator/src/orderUpdater.js`
- Create: `workers/video-generator/tests/orderUpdater.test.js`

**Interfaces:**
- Consumes: `{ orderId, status, progress, videoUrl, error }`
- Produz: `updateOrderStatus(orderId, updates)` -> Promise<void>

- [ ] **Step 1: Escrever teste para orderUpdater**
Verificar atualização dos campos `video_status`, `video_progress`, `video_url` e `video_error`.

- [ ] **Step 2: Implementar orderUpdater.js**
Utilizar `@supabase/supabase-js` com chave de serviço (service_role ou anon) para persistir o status no Postgres.

- [ ] **Step 3: Executar testes do updater**
Confirmar que chamadas não travam o processo principal mesmo em caso de erro transitório de rede.

---

### Task 6: Servidor Express e Fila de Concorrência (`server.js` e `src/queue.js`)

**Files:**
- Create: `workers/video-generator/src/queue.js`
- Create: `workers/video-generator/server.js`
- Create: `workers/video-generator/tests/server.test.js`

**Interfaces:**
- Produz: Servidor HTTP rodando na porta 3100 com endpoints `GET /health` e `POST /render`.

- [ ] **Step 1: Escrever testes para as rotas da API**
Testar autenticação via Bearer token, validação de body obrigatório e retorno HTTP 202 Accepted.

- [ ] **Step 2: Implementar fila de concorrência (`src/queue.js`)**
Fila em memória assíncrona limitando o processamento a 2 vídeos simultâneos para preservar a CPU da VPS.

- [ ] **Step 3: Implementar server.js**
Conectar middlewares de log, autenticação, orquestração (downloader -> ffmpeg -> r2 -> supabase -> cleanup) e rota `/health`.

- [ ] **Step 4: Executar testes de integração do servidor**
Validar que requisições sem token retornam 401 e requisições válidas retornam 202 com status enfileirado.

---

### Task 7: Rota Segura no Next.js com Toggle (`src/app/api/video/render/route.js`)

**Files:**
- Create: `src/app/api/video/render/route.js`
- Create: `tests/unit/video-render-route.test.js`

**Interfaces:**
- Consumes: `POST /api/video/render` `{ orderId, imageUrls, targetTrack }`
- Produz: JSON `{ success: true, vpsEnabled: true }` ou `{ vpsEnabled: false }`

- [ ] **Step 1: Escrever teste unitário para /api/video/render**
Testar comportamento com e sem `VPS_VIDEO_URL` configurado.

- [ ] **Step 2: Implementar src/app/api/video/render/route.js**
Definir `export const runtime = 'edge'`.
Verificar permissão do pedido no Supabase.
Se `VPS_VIDEO_URL` estiver setada, encaminhar para a VPS com `VPS_VIDEO_SECRET` e atualizar `videoStatus: 'GERANDO'` no Supabase.

- [ ] **Step 3: Executar teste unitário no Next.js**
Executar `npx vitest run tests/unit/video-render-route.test.js`.

---

### Task 8: Manual Completo de Instalação na VPS e Verificação Geral

**Files:**
- Modify: `workers/video-generator/README.md`
- Verify: `npm run build` na raiz do NSMusic

- [ ] **Step 1: Redigir o guia definitivo no README.md**
Incluir comandos exatos do terminal Ubuntu para:
1. Clonar ou subir a pasta para a VPS.
2. Criar o arquivo `.env`.
3. Rodar com Docker (`docker compose up -d`).
4. Ou rodar com PM2 (`pm2 start server.js --name nsmusic-video`).
5. Configuração simples de Nginx / Cloudflare Tunnel para expor o domínio.

- [ ] **Step 2: Rodar build do projeto Next.js**
Executar `npm run build` para garantir que o projeto principal continua 100% íntegro e sem regressões.
