# 🎬 NSMusic - Microserviço de Geração de Vídeo na VPS (FFmpeg)

Serviço autocontido em **Node.js + FFmpeg** para renderização de vídeos slideshow de homenagem em alta definição vertical (**720x1280 MP4**), com efeitos de transição suaves, fundo preenchido e áudio sincronizado.

Elimina definitivamente os travamentos e falhas de geração nos navegadores dos clientes (telas de celular bloqueadas, navegadores in-app do WhatsApp, timeouts e aparelhos com pouca memória).

---

## 📋 Pré-requisitos na VPS

- Sistema Operacional: **Ubuntu 20.04 / 22.04 / 24.04** ou **Debian 11 / 12**
- Opção A (Recomendada): **Docker** e **Docker Compose**
- Opção B: **Node.js 20+** e **FFmpeg** instalados nativamente

---

## 🛠️ Passo a Passo para Subir na VPS

### 1. Clonar ou copiar o código para a VPS

Na sua VPS, entre no diretório do projeto ou clone o repositório:
```bash
git clone https://github.com/nsnexus/nsmusic-.git
cd nsmusic-/workers/video-generator
```

*(Ou transfira diretamente a pasta `workers/video-generator` via SCP/SFTP).*

---

### 2. Configurar o arquivo `.env`

Crie o arquivo `.env` a partir do modelo:
```bash
cp .env.example .env
nano .env
```

Preencha as variáveis de ambiente:
```env
PORT=3100
NODE_ENV=production

# Escolha uma senha/chave forte para autenticar o Next.js com a sua VPS
VPS_VIDEO_SECRET=coloque_uma_chave_secreta_aqui

# Limite de vídeos sendo gerados ao mesmo tempo (evita afogar a CPU)
MAX_CONCURRENT_JOBS=2

# Supabase (para atualizar status do pedido automaticamente)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_aqui

# Cloudflare R2 (para fazer upload do vídeo MP4 gerado)
R2_ACCOUNT_ID=seu_account_id_cloudflare
R2_ACCESS_KEY_ID=sua_r2_access_key_id
R2_SECRET_ACCESS_KEY=sua_r2_secret_access_key
R2_BUCKET_NAME=nsmusic-media
R2_PUBLIC_URL=https://media.nsmusic.ia.br
```

---

### 3. Iniciar o Serviço

#### 🐳 Opção 1: Usando Docker (Mais simples e isolado)

Com o Docker instalado na VPS, basta rodar:
```bash
docker compose up -d --build
```

Para checar os logs em tempo real:
```bash
docker compose logs -f
```

Para reiniciar:
```bash
docker compose restart
```

---

#### ⚡ Opção 2: Usando PM2 direto no Ubuntu

1. Instale o FFmpeg e o Node.js 20:
   ```bash
   sudo apt update
   sudo apt install -y ffmpeg fonts-freefont-ttf
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo npm install -g pm2
   ```

2. Instale as dependências:
   ```bash
   npm install --omit=dev
   ```

3. Inicie o processo com PM2:
   ```bash
   pm2 start server.js --name nsmusic-video
   pm2 save
   pm2 startup
   ```

---

## 🌐 Configuração de Domínio e SSL (Nginx)

Para conectar o Next.js (Cloudflare Pages) com a sua VPS de forma segura via HTTPS:

1. Instale o Nginx e o Certbot:
   ```bash
   sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. Crie uma configuração no Nginx (ex: `/etc/nginx/sites-available/video-vps`):
   ```nginx
   server {
       server_name video.nsmusic.ia.br;

       location / {
           proxy_pass http://127.0.0.1:3100;
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 300s;
           proxy_connect_timeout 75s;
       }
   }
   ```

3. Ative o site e emita o certificado SSL gratuito:
   ```bash
   sudo ln -s /etc/nginx/sites-available/video-vps /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d video.nsmusic.ia.br
   ```

*(Alternativa: você também pode usar o **Cloudflare Tunnel** (`cloudflared`) para expor a porta 3100 sem precisar abrir portas de firewall na VPS).*

---

## 🧪 Como Testar a API

### 1. Teste de Saúde (`/health`)
```bash
curl http://localhost:3100/health
```
Resposta esperada:
```json
{
  "status": "ok",
  "service": "nsmusic-video-generator",
  "queue": {
    "concurrency": 2,
    "activeCount": 0,
    "queuedCount": 0
  }
}
```

### 2. Teste de Renderização (`/render`)
```bash
curl -X POST http://localhost:3100/render \
  -H "Authorization: Bearer SEU_VPS_VIDEO_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "teste-001",
    "audioUrl": "https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev/audios/exemplo.mp3",
    "imageUrls": [
      "https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev/photos/foto1.jpg",
      "https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev/photos/foto2.jpg"
    ],
    "title": "Homenagem Teste"
  }'
```
Resposta esperada: HTTP 202 Accepted.

---

## 🔗 Ativando a Conexão no Cloudflare Pages (Produção)

Quando você tiver subido a VPS e ela estiver respondendo:

1. Acesse o **Cloudflare Dashboard** > **Workers & Pages** > projeto **nsmusic**.
2. Vá em **Settings** > **Environment variables**.
3. Adicione as duas variáveis:
   - `VPS_VIDEO_URL`: `https://video.nsmusic.ia.br` (ou `http://SEU_IP:3100`)
   - `VPS_VIDEO_SECRET`: O mesmo valor configurado no `.env` da VPS.
4. Salve e faça um redeploy.

Pronto! A partir desse momento, o Next.js passará automaticamente a delegar toda a renderização para a VPS em segundo plano!
