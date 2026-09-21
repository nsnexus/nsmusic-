# Troca de domínio: nsmusic.nsnexus.com.br → nsmusic.ia.br

Domínio registrado no Registro.br em 20/09/2026. Este documento é o procedimento completo, na
ordem em que precisa ser feito, e o motivo de cada passo.

## A regra que não pode ser quebrada

**O domínio antigo (`nsmusic.nsnexus.com.br`) nunca pode ser desligado.** Todo link de entrega já
enviado por WhatsApp para cliente aponta para ele — são centenas de mensagens que não dá para
reenviar. Ele vira um redirecionador permanente, não um domínio aposentado.

E o corolário disso: **`/api/*` do domínio antigo NÃO é redirecionado.** A Efí, a Kie.ai e a W-API
têm URLs de callback registradas lá. Um redirect 301 em cima de um `POST` de webhook é aposta: parte
dos clientes HTTP não segue redirect em POST, e parte converte para GET, perdendo o corpo. Webhook
que se perde aqui é pagamento não computado ou música que não chega.

## Estado do código

Toda referência ao domínio passa por `src/lib/siteUrl.js`:

- `DOMINIO_CANONICO` — a constante. É o fallback de tudo.
- `SITE_URL` — valor de build (metadados, canonical, sitemap, robots, JSON-LD). Lê
  `NEXT_PUBLIC_SITE_URL`, ignorando `localhost` e `*.pages.dev`.
- `resolverSiteUrl(env)` — para rota Edge, onde o valor vem do `env` da requisição
  (`callBackUrl` da Kie.ai, Meta CAPI).

Trocar de domínio = mudar `DOMINIO_CANONICO` **e** a variável `NEXT_PUBLIC_SITE_URL` no Cloudflare
Pages. Nada mais no código.

## Ordem dos passos

A ordem importa. Apontar o código para um domínio que ainda não responde quebra a geração de
música: o `callBackUrl` mandado à Kie.ai vai para um host morto e a música nunca volta.

### 1. Adicionar a zona no Cloudflare

Cloudflare → **Add a site** → `nsmusic.ia.br` → plano **Free**. O Cloudflare mostra dois
nameservers (algo como `xxx.ns.cloudflare.com`). Anotar os dois.

### 2. Apontar os nameservers no Registro.br

registro.br → Painel → o domínio `nsmusic.ia.br` → **Alterar servidores DNS** → substituir pelos
dois do Cloudflare → salvar.

Propagação: normalmente de 30 minutos a algumas horas; o Registro.br publica a mudança na zona
`.br` em lotes. O Cloudflare envia e-mail quando a zona fica **Active**. Não seguir para o passo 3
antes disso.

### 3. Ligar o domínio ao Pages

Cloudflare → Workers & Pages → **nsmusic** → Custom domains → **Set up a domain**:

- `nsmusic.ia.br`
- `www.nsmusic.ia.br`

Como a zona está na mesma conta, o Cloudflare cria os registros e emite o certificado sozinho.
Aguardar os dois ficarem **Active** (alguns minutos).

Conferir antes de prosseguir:

```bash
curl -sI https://nsmusic.ia.br | head -3
```

### 4. Virar a chave no código

Só depois que o passo 3 respondeu 200:

1. `src/lib/siteUrl.js` → `DOMINIO_CANONICO = 'https://nsmusic.ia.br'`
2. `public/llms.txt` → trocar as URLs da seção Links
3. Cloudflare Pages → Settings → Environment variables (**Production**) →
   `NEXT_PUBLIC_SITE_URL = https://nsmusic.ia.br`
4. Commit e push. **Variável de ambiente no Pages só passa a valer no deploy seguinte** — o push
   resolve isso, mas mudar a variável sem fazer deploy não muda nada.

### 5. Redirecionar o domínio antigo

Cloudflare → zona **nsnexus.com.br** → Rules → **Redirect Rules** → Create rule:

- Nome: `nsmusic antigo -> ia.br`
- When incoming requests match — Custom filter expression:
  ```
  (http.host eq "nsmusic.nsnexus.com.br" and not starts_with(http.request.uri.path, "/api/"))
  ```
- Then: **Dynamic redirect**
  - Expression: `concat("https://nsmusic.ia.br", http.request.uri)`
  - Status: **301**
  - Preserve query string: **ligado**

Isso preserva o caminho inteiro, então `…/entrega?orderId=abc` do WhatsApp antigo cai em
`https://nsmusic.ia.br/entrega?orderId=abc`. E deixa `/api/*` intacto, pelo motivo do topo deste
documento.

Conferir:

```bash
curl -sI https://nsmusic.nsnexus.com.br/entrega?orderId=teste | head -5
curl -s -o /dev/null -w "%{http_code}\n" https://nsmusic.nsnexus.com.br/api/payments/status
```

O primeiro tem que responder `301` com `location:` no domínio novo. O segundo **não** pode ser 301.

### 6. Serviços externos

Nenhum destes quebra na hora da virada (o domínio antigo continua servindo `/api/*`), mas todos
precisam ser atualizados para o domínio novo ser o de verdade:

| Serviço | O que fazer | Se esquecer |
|---|---|---|
| **Firebase** → Authentication → Settings → Authorized domains | Adicionar `nsmusic.ia.br` | Login com Google quebra no domínio novo |
| **Efí** → webhook | Reregistrar com `scripts/register-efi-webhook.mjs` e `EFI_WEBHOOK_URL` no domínio novo (ver `docs/EFI_SETUP.md`) | Nada quebra: continua chegando no domínio antigo |
| **Fly.io** (efi-proxy) | `fly secrets set APP_URL="https://nsmusic.ia.br"` | Só afeta log/origem |
| **Meta Business** | Verificar o domínio novo e atualizar o domínio de conversão dos anúncios | Otimização de campanha degrada |
| **Google Search Console** | Criar a propriedade nova, enviar o sitemap, usar **Mudança de endereço** apontando do antigo para o novo | O Google demora muito mais a transferir a autoridade |
| **W-API** | Conferir a URL de webhook cadastrada | Mensagem recebida no WhatsApp não é processada |
| **Google Analytics / Ads** | Nada obrigatório | — |

### 7. Depois da virada

```bash
curl -s https://nsmusic.ia.br/robots.txt | head -3
curl -s https://nsmusic.ia.br/sitemap.xml | grep -o '<loc>[^<]*</loc>' | head -3
curl -s https://nsmusic.ia.br/ | grep -o 'rel="canonical" href="[^"]*"'
```

Tudo tem que citar `nsmusic.ia.br`. Se o canonical ainda disser `nsnexus`, o
`NEXT_PUBLIC_SITE_URL` não foi aplicado — confirmar que houve deploy **depois** de salvar a
variável.

E o teste que importa de verdade: criar um pedido próprio no domínio novo e ir até o fim (letra →
música → Pix → `/entrega`). A geração de música é o que depende do `callBackUrl`, e é o único jeito
de provar que o webhook da Kie.ai está chegando no domínio certo.
