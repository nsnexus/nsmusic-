# 🤖 NSMusic - Robô Local de Automação Suno.com

Este worker automatiza a criação de músicas personalizadas diretamente na sua conta oficial da **Suno.com** (usando seus créditos de assinante Pro ou Premier), sem custo por API de terceiros, sem limites de download da interface web e sem expirar links.

---

## ⚡ Como Funciona

1. **Fila Automática:** O robô roda no seu computador e monitora pedidos com status `PENDENTE_ROBO` no banco de dados do NSMusic (Supabase).
2. **Navegador Playwright:** Ele abre o Suno.com com um perfil exclusivo e persistente do Chrome (`./perfil-chrome`). Você só precisa fazer login na Suno **uma única vez**.
3. **Criação da Música:** Quando entra um pedido no NSMusic, ele preenche a letra personalizada, o estilo musical e o título, e clica em **Create**.
4. **Captura Direta da CDN:** Em vez de tentar baixar pelo botão do site da Suno (que tem limite diário na web), o robô intercepta a URL direta de streaming do áudio (`cdn1.suno.ai/[id].mp3`).
5. **Upload Seguro no Cloudflare R2:** Ele baixa os bytes brutos do áudio e faz o upload definitivo para o seu bucket R2, garantindo que o cliente ouça a prévia e receba os arquivos sem depender da Suno.
6. **Failover de 3 Minutos:** Se você desligar o PC ou fechar o robô, o NSMusic aguarda até 3 minutos e automaticamente transfere o pedido para a **Kie.ai**, garantindo que nenhum cliente fique esperando.

---

## 🚀 Como Iniciar

### 1. Configurar o `.env`
Na pasta `local-worker`, copie o arquivo `.env.example` para `.env`:
```bash
cp .env.example .env
```
Preencha as variáveis no `.env`:
- `SUPABASE_URL`: URL do seu projeto Supabase (ex: `https://xxxx.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY`: Chave Service Role do Supabase (para ler a fila e atualizar os pedidos)
- `NSMUSIC_API_BASE_URL`: URL do seu sistema (ex: `https://nsmusic.pages.dev` ou `https://nsmusic.nsnexus.com.br`)
- `ADMIN_SECRET_KEY`: Seu token de admin do NSMusic (para autorizar o upload de áudio no R2)

### 2. Executar o Robô
Basta dar **dois cliques** no arquivo:
```
iniciar-robo.bat
```
*(O script instalará as dependências automaticamente na primeira execução se a pasta `node_modules` ainda não existir).*

---

## 🔑 Primeiro Acesso (Login na Suno)
Na primeira vez que você rodar o script:
1. Uma janela do Google Chrome será aberta no endereço `https://suno.com/create`.
2. O terminal solicitará:
   ```
   [Suno Automator] Faça login na sua conta Suno no navegador aberto.
   Pressione ENTER aqui no terminal após concluir o login...
   ```
3. Faça login normalmente na Suno com seu método habitual (Google, Discord, etc.).
4. Volte ao terminal e aperte `ENTER`.
5. Pronto! Sua sessão fica salva na pasta `local-worker/perfil-chrome/`. Nas próximas vezes, o login será automático e imediato.

---

## 🖥️ Painel Admin do NSMusic
No painel `/admin`, na seção **🎹 Provedor Principal de Música (IA)**:
- Clique no botão **🖥️ Suno Local (PC)** para torná-lo o provedor padrão.
- Você verá o indicador **🟢 Robô Local Conectado** quando o script estiver rodando no seu computador.
- Se o robô for fechado, o painel exibirá o aviso e a Kie.ai assumirá o papel de segurança automaticamente.
