# Configuração da Efí (API Pix) — checklist de setup

> Este documento cobre só os passos que precisam ser feitos **fora do código**, nas contas Efí e
> Cloudflare do projeto. O código já está pronto (`src/lib/efi.js`, `api/payments/create`,
> `api/payments/status`, `api/webhooks/efi`, `workers/efi-proxy-fly/`) e só funciona depois destes passos
> serem concluídos.
>
> Contexto: a migração para a Efí substituiu o bypass manual de PIX (BR Code estático + validação
> visual) usado depois de dois bloqueios seguidos da conta do Mercado Pago. Ver
> `docs/audit/FIX_PLAN.md` para o histórico completo da decisão.

## Por que isso não é só uma variável de ambiente

A API Pix da Efí exige **mTLS (certificado cliente) em toda chamada**, inclusive na autenticação —
exigência do Banco Central para PSPs, não uma opção da Efí. Isso não pode ser resolvido com um
simples `Authorization: Bearer`; é preciso apresentar um certificado na conexão TLS.

**Cloudflare Pages não suporta esse tipo de binding.** Certificado mTLS (`mtls_certificate`) é um
recurso exclusivo de Workers — confirmado na documentação oficial da Cloudflare (bindings do Pages
Functions, mTLS certificate binding, e configuração via `wrangler.toml` para Pages não listam essa
opção em nenhum lugar) e na prática: a modal "Add a resource binding" de um projeto Pages não mostra
"mTLS Certificate" entre as opções.

Por isso existe um **relay dedicado**: um serviço mínimo que detém o certificado e faz a chamada
mTLS até a Efí. O app Next.js (que continua em Cloudflare Pages) fala com esse relay por HTTPS
simples, autenticado por um segredo compartilhado (`EFI_PROXY_SECRET`). O relay nunca aceita host/URL
do chamador — só um enum `env` (sandbox/production) + path + método validados contra uma allowlist
fechada, o que elimina SSRF por construção.

### ⚠️ O relay roda no Fly.io, não mais num Worker Cloudflare (desde 18/09/2026)

A primeira versão do relay era um Worker Cloudflare (`workers/efi-proxy/`). **Isso não funciona
mais**: a Efí também fica atrás de Cloudflare e o WAF dela responde **HTTP 403 a todo tráfego vindo
da faixa de IP dos Workers**. O bloqueio apareceu em 14/08/2026 e foi confirmado de novo em
18/09/2026 (Ray ID `a3d369f23da0cabe`) — não depende do certificado nem das credenciais, a chamada
nem chega a autenticar.

Enquanto ninguém percebeu, **toda cobrança caiu no fallback estático por mais de um mês** (PIX manual
do dono + comprovante enviado pelo cliente, ver `src/lib/pixStatic.js`).

O relay atual é `workers/efi-proxy-fly/` (Fly.io, app `efi-proxy-fly`, hostname
`efi-proxy-fly.fly.dev`), fora dessa faixa de IP. Mesmo desenho de segurança do Worker original.
O Worker antigo continua deployado **apenas** pelos cron triggers dele (reconcile, recover, cleanup,
archive-audio), que não usam mTLS.

## Passo a passo

### 1. Na Efí
1. Crie/acesse a conta Efí e vá em **Aplicações → API Pix**.
2. Gere as credenciais (Client ID/Secret) do ambiente que for usar primeiro — comece por
   **sandbox/homologação**.
3. Gere o certificado da API Pix (arquivo `.p12`) na mesma tela.
4. Cadastre uma **chave Pix** na conta (recomendado: chave aleatória/EVP) — é o valor de
   `EFI_PIX_KEY`.

### 2. Converter o certificado para PEM
O upload via Wrangler espera certificado e chave em PEM separados, não o `.p12` direto:
```bash
openssl pkcs12 -in certificado.p12 -clcerts -nokeys -out cert.pem
openssl pkcs12 -in certificado.p12 -nocerts -nodes -out key.pem
```

### 3. Subir o certificado e fazer o deploy do relay de mTLS (Fly.io)

O relay vive em `workers/efi-proxy-fly/` (o nome da pasta ficou por herança; não é mais um Worker).
Certificado e chave vão como **secret em base64**, um par por ambiente — o `server.js` escolhe qual
usar por requisição, com base no `env` mandado pelo app.

```bash
cd workers/efi-proxy-fly

# 1. Segredo compartilhado com o app (gere uma vez e use o MESMO valor no Pages, passo 4)
openssl rand -hex 32

fly secrets set \
  EFI_PROXY_SECRET="<valor gerado acima>" \
  RECONCILE_SECRET="<mesmo valor do Cloudflare Pages>" \
  APP_URL="https://nsmusic.nsnexus.com.br" \
  EFI_PRODUCTION_CERT_B64="$(base64 -w0 ../../cert.pem)" \
  EFI_PRODUCTION_KEY_B64="$(base64 -w0 ../../key.pem)" \
  -a efi-proxy-fly

# 2. Deploy (o fly.toml já está no repositório)
fly deploy -a efi-proxy-fly
```

Para sandbox, os mesmos passos com `EFI_SANDBOX_CERT_B64` / `EFI_SANDBOX_KEY_B64`.

`fly secrets set` já reinicia as máquinas sozinho — não precisa de deploy extra depois de trocar um
certificado. A URL pública (`https://efi-proxy-fly.fly.dev`) é o que vai em `EFI_PROXY_URL`.

Para validar sem criar cobrança de verdade, chame só o `/oauth/token` pelo relay:

```bash
BASIC=$(printf "%s:%s" "$EFI_CLIENT_ID" "$EFI_CLIENT_SECRET" | base64 -w0)
curl -s -X POST "https://efi-proxy-fly.fly.dev/relay" \
  -H "Content-Type: application/json" \
  -H "X-Efi-Proxy-Secret: $EFI_PROXY_SECRET" \
  -d "{\"env\":\"production\",\"path\":\"/oauth/token\",\"method\":\"POST\",\"headers\":{\"Authorization\":\"Basic $BASIC\",\"Content-Type\":\"application/json\"},\"body\":\"{\\\"grant_type\\\":\\\"client_credentials\\\"}\"}"
```

Resposta esperada: HTTP 200 com `access_token` e os escopos da aplicação. Um HTML de
"Attention Required! | Cloudflare" com HTTP 403 significa que a chamada saiu de uma faixa de IP
bloqueada pelo WAF da Efí — foi exatamente o que aposentou o Worker Cloudflare.

### 4. Cadastrar as variáveis de ambiente do projeto Cloudflare **Pages**
| Variável | Valor |
|---|---|
| `EFI_CLIENT_ID` | Client ID gerado no passo 1 |
| `EFI_CLIENT_SECRET` | Client Secret gerado no passo 1 |
| `EFI_PIX_KEY` | Chave Pix cadastrada no passo 1 |
| `EFI_ENV` | `sandbox` (depois `production`, só após validar tudo) |
| `EFI_PROXY_URL` | URL pública do relay no Fly (`https://efi-proxy-fly.fly.dev`) |
| `EFI_PROXY_SECRET` | O MESMO valor configurado no relay (passo 3) |
| `EFI_WEBHOOK_SECRET` | String aleatória gerada por vocês (ex: `openssl rand -hex 24`) |

Essas variáveis vão no dashboard do projeto Pages (Settings → Environment variables) — nenhuma delas
é um binding, são env vars normais. Repetir para os ambientes Production e Preview.

> ⚠️ **Secret novo no Pages só vale a partir do próximo deploy** (achado 20/09/2026). Tanto pelo
> dashboard quanto por `npx wrangler pages secret put`, o valor fica guardado mas o deployment que
> já está no ar continua lendo o valor antigo. Isso é especialmente traiçoeiro nos segredos
> compartilhados com o Worker (`RECONCILE_SECRET`, `CLEANUP_SECRET`, `EFI_PROXY_SECRET`): rotacionar
> só de um lado deixa os dois dessincronizados em silêncio — o cron passa a receber 401 e para de
> funcionar sem erro visível em lugar nenhum. Depois de trocar qualquer um deles, **faça um deploy**
> (qualquer push para `master`) e confirme chamando a rota na mão.

### Pegadinha conhecida: certificado com serial number negativo

Em 2026-08-02, um certificado gerado pela Efí foi **rejeitado pela Cloudflare** no passo de upload
(`wrangler mtls-certificate upload` → erro `Unable to parse certificate [code: 1408]`), mesmo sendo
um certificado válido (OpenSSL lia e validava normalmente). Causa: o certificado tinha um **serial
number negativo** (`openssl x509 -in cert.pem -noout -text` mostra `Serial Number: (Negative) ...`)
— o primeiro byte do serial tinha o bit mais alto ligado, o que é ambíguo em ASN.1/ DER e viola o
RFC 5280 (serial deveria ser sempre positivo). O OpenSSL tolera isso; o parser da Cloudflare não.
Isso não tem conserto no arquivo (mudar qualquer byte invalidaria a assinatura da Efí) — a solução
foi simplesmente **gerar outro certificado** no painel da Efí até sair um com serial positivo
(`Serial Number:` sem o aviso `(Negative)`). Ao converter um novo certificado, sempre confira:
```bash
openssl x509 -in cert.pem -noout -text | grep -A1 "Serial Number"
```
Se aparecer `(Negative)`, gere outro certificado antes de tentar o upload.

### 5. Registrar o webhook
A chamada de registro (`PUT /v2/webhook/:chave`) também exige mTLS, então é feita por um script
local com o certificado no disco — não passa pelo relay nem por uma rota do app.

O script manda o header `x-skip-mtls-checking: true`. Sem ele a Efí recusa com
`{"nome":"webhook_invalido","mensagem":"A autenticação de TLS mútuo não está configurada na URL
informada"}` (HTTP 400): por padrão ela exige que a **URL de retorno** também apresente certificado
cliente quando ela chamar de volta, e uma rota comum em Cloudflare Pages não faz isso. Isso não
enfraquece o nosso lado — continuamos apresentando o certificado em toda chamada que fazemos. A
autenticação do webhook é o `?secret=` (`EFI_WEBHOOK_SECRET`) e, principalmente, a reconsulta
obrigatória da cobrança na API da Efí antes de aprovar qualquer pagamento (ver
`src/app/api/webhooks/efi/route.js`).
```bash
EFI_CLIENT_ID=... EFI_CLIENT_SECRET=... EFI_PIX_KEY=... EFI_ENV=sandbox \
EFI_CERT_PATH=./cert.pem EFI_KEY_PATH=./key.pem \
EFI_WEBHOOK_URL="https://SEU_DOMINIO/api/webhooks/efi?secret=O_MESMO_EFI_WEBHOOK_SECRET_DO_PASSO_4" \
  node scripts/register-efi-webhook.mjs
```

### 6. Configurar a reconciliação agendada

A confirmação de pagamento (e de música pronta) depende de duas vias: o webhook do provedor e o
polling feito pelo **navegador do cliente**. Quando o webhook falha e o cliente fecha a aba, ninguém
mais converge o pedido — ele paga e o produto nunca é liberado. A terceira via é
`POST /api/orders/reconcile`, que consulta a Efí e a Kie.ai direto do servidor.

O agendamento mora no Worker (`[triggers] crons` em `workers/efi-proxy/wrangler.toml`, handler
`scheduled` em `src/worker.js`) porque **Cloudflare Pages não suporta cron trigger** — só Workers
suportam, a mesma limitação que obrigou este Worker a existir.

Gere um segredo e configure nos **dois** lados com o mesmo valor:
```bash
openssl rand -hex 32
```
| Onde | Como |
|---|---|
| Worker | `npx wrangler secret put RECONCILE_SECRET --config workers/efi-proxy/wrangler.toml` |
| App (Pages) | Settings → Environment variables → `RECONCILE_SECRET` |

Confira também que `APP_URL` em `wrangler.toml` aponta para o domínio de produção do app. Depois de
`npm run deploy:efi-proxy`, acompanhe a primeira execução com:
```bash
npx wrangler tail --config workers/efi-proxy/wrangler.toml
```

Sem essas variáveis o cron roda, loga um aviso e não faz nada — a rota continua acessível
manualmente pelo painel `/admin` (aba **Pedidos Travados**), que autoriza por token de admin.

## Testando localmente (com `npm run dev`)

Diferente do binding de Pages (que só existia no runtime deployado), a chamada do app até o Worker é
HTTPS simples — então `npm run dev` local **consegue** testar o fluxo completo, desde que o Worker já
esteja deployado (passo 3) e `EFI_PROXY_URL`/`EFI_PROXY_SECRET` (e os demais `EFI_*`) estejam num
`.env.local`. Aponte para o Worker do ambiente sandbox durante o desenvolvimento.

Os testes automatizados (`npm test`) continuam funcionando normalmente sem nenhuma credencial real,
mockando o `fetch` global (`tests/unit/efi.test.js`) e os bindings `EFI_MTLS_CERT_SANDBOX`/
`EFI_MTLS_CERT_PRODUCTION` do Worker (`tests/unit/efi-proxy-worker.test.js`).

## Ordem recomendada de validação

1. Worker de mTLS deployado (sandbox) + `EFI_PROXY_URL`/`EFI_PROXY_SECRET` configurados (local ou
   num deploy do Pages).
2. Gerar uma cobrança pelo fluxo normal do site, confirmar que o QR/copia-e-cola aparece.
3. Pagar a cobrança de sandbox (a Efí costuma oferecer um simulador de pagamento no ambiente de
   homologação — conferir na documentação da conta) e confirmar que o webhook chega e o pedido é
   aprovado em `/entrega`.
4. Repetir os passos 1, 3, 4, 5 do checklist acima com credenciais e certificado de **produção**
   (`EFI_ENV=production`) — o mesmo Worker recebe um segundo binding (`EFI_MTLS_CERT_PRODUCTION`),
   sem precisar de um Worker separado. Antes de trocar as env vars do projeto Pages para as
   credenciais de produção, validar a autenticação isoladamente (só `/oauth/token`, sem criar
   cobrança) — criar uma cobrança de verdade em produção gera um PIX real que pode ser pago com
   dinheiro de verdade, então evite gerar cobranças de teste nesse ambiente.

**Concluído em 2026-08-02**: Worker com os dois bindings (`c8facf26-...` sandbox,
`cb017d25-...` produção) deployado e testado — autenticação `/oauth/token` confirmada nos dois
ambientes. Variáveis de produção (`EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_ENV=production`) já
configuradas no projeto Pages; `EFI_PIX_KEY` é a mesma chave (EVP) usada em sandbox e produção,
cadastrada uma vez na conta.

**Migração para conta PJ + volta do Pix automático, 2026-09-18**: conta PJ nova na Efí (CNPJ
`68471413000198` como chave Pix), aplicação criada com os escopos `cob.read`, `cob.write`,
`webhook.read` e `webhook.write`. Relay movido do Worker Cloudflare para o Fly.io por causa do
bloqueio de WAF descrito no topo. Validado em produção: `/oauth/token` HTTP 200 e
`PUT /v2/cob/:txid` HTTP 201 com QR real. Webhook registrado e confirmado por
`GET /v2/webhook/:chave`. `EFI_WEBHOOK_SECRET` passou a existir (antes não havia nenhum, e o
webhook aceitava chamada sem autenticação).

O certificado da Efí precisou ser gerado **4 vezes** até sair um com serial number positivo — ver a
pegadinha logo acima.

**PagBank removido em 2026-09-18**: era o degrau intermediário da cadeia de fallback
(`Efí → PagBank → Pix estático`), mas `PAGBANK_TOKEN` nunca chegou a ser configurado em produção —
toda tentativa falhava e só atrasava a resposta ao cliente. A cadeia agora é `Efí → Pix estático`.

## Fora de escopo desta migração

- **Devolução/estorno de Pix** — a Efí trata isso como fluxo separado
  (`GET /v2/pix/{e2eid}/devolucao`); não foi implementado. Se um cliente pedir reembolso, o estorno
  precisa ser feito manualmente pelo painel da Efí, sem refletir automaticamente no Firestore.
- **CPF do pagador (`devedor`)** — o formulário atual não coleta CPF. O código só envia esse campo à
  Efí se ele existir no pedido. Se o sandbox acusar erro de validação exigindo `devedor`, será
  necessário decidir se um campo de CPF entra no formulário de checkout antes de ir para produção.
