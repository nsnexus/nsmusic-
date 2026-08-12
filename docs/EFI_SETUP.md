# Configuração da Efí (API Pix) — checklist de setup

> Este documento cobre só os passos que precisam ser feitos **fora do código**, nas contas Efí e
> Cloudflare do projeto. O código já está pronto (`src/lib/efi.js`, `api/payments/create`,
> `api/payments/status`, `api/webhooks/efi`, `workers/efi-proxy/`) e só funciona depois destes passos
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

Por isso a arquitetura é: um **Worker Cloudflare dedicado** (`workers/efi-proxy/`), que existe só
para deter o certificado e fazer a chamada mTLS até a Efí. O app Next.js (que continua em Cloudflare
Pages, sem migração) fala com esse Worker por HTTPS simples, autenticado por um segredo
compartilhado (`EFI_PROXY_SECRET`). Ver o comentário de topo de `src/lib/efi.js` e
`workers/efi-proxy/src/worker.js` para o desenho completo (allowlist fechada de path/método, sem
aceitar host do chamador — elimina SSRF por construção).

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

### 3. Subir o certificado e fazer o deploy do Worker de mTLS
Tudo isso é feito com o Wrangler CLI (já é devDependency do projeto — `npx wrangler`), a partir da
raiz do repositório:

Sandbox e produção são certificados diferentes na Efí, e o Worker mantém os dois bindings
simultaneamente (`EFI_MTLS_CERT_SANDBOX` e `EFI_MTLS_CERT_PRODUCTION` em
`workers/efi-proxy/wrangler.toml`) — o código escolhe qual usar por requisição, com base no `env`
mandado pelo app. Repita os passos abaixo uma vez para cada ambiente.

```bash
# 1. Sobe o certificado na conta Cloudflare e devolve um certificate_id
npx wrangler mtls-certificate upload --cert cert.pem --key key.pem --name efi-pix-sandbox
#   (para produção: --name efi-pix-production)

# 2. Cole o certificate_id retornado acima em workers/efi-proxy/wrangler.toml, no binding certo
#    (EFI_MTLS_CERT_SANDBOX ou EFI_MTLS_CERT_PRODUCTION, dentro de [[mtls_certificates]])

# 3. Gere um segredo aleatório e configure no Worker (nunca no wrangler.toml)
openssl rand -hex 32
npx wrangler secret put EFI_PROXY_SECRET --config workers/efi-proxy/wrangler.toml
#    (cole o valor gerado quando solicitado)

# 4. Deploy do Worker
npm run deploy:efi-proxy
```

Por padrão o comando de deploy imprime a URL pública do Worker no formato
`https://nsmusic-efi-proxy.SEU_SUBDOMINIO.workers.dev`. **Não use essa URL compartilhada** —
testes em 2026-08-02 mostraram instabilidade intermitente nela (respostas 500 sem exceção nem log
algum do lado do Worker, aparentemente alguma política de rate-limit/anti-abuso do subdomínio
`workers.dev`, que é compartilhado entre todos os clientes Cloudflare). Configure um domínio próprio
no `wrangler.toml` do Worker (`workers/efi-proxy/wrangler.toml`), usando uma zona que já esteja na
mesma conta Cloudflare:

```toml
routes = [
  { pattern = "efi-proxy.SEU_DOMINIO.com.br", custom_domain = true }
]
```

Rode `npm run deploy:efi-proxy` de novo depois de adicionar isso — o Wrangler cria o domínio
customizado automaticamente (registro DNS incluído) e desativa o `workers.dev` na mesma passada.
É essa URL de domínio próprio (`https://efi-proxy.SEU_DOMINIO.com.br`) que vai em `EFI_PROXY_URL`.

### 4. Cadastrar as variáveis de ambiente do projeto Cloudflare **Pages**
| Variável | Valor |
|---|---|
| `EFI_CLIENT_ID` | Client ID gerado no passo 1 |
| `EFI_CLIENT_SECRET` | Client Secret gerado no passo 1 |
| `EFI_PIX_KEY` | Chave Pix cadastrada no passo 1 |
| `EFI_ENV` | `sandbox` (depois `production`, só após validar tudo) |
| `EFI_PROXY_URL` | URL do Worker, obtida no passo 3.4 |
| `EFI_PROXY_SECRET` | O MESMO valor gerado e configurado no Worker no passo 3.3 |
| `EFI_WEBHOOK_SECRET` | String aleatória gerada por vocês (ex: `openssl rand -hex 24`) |

Essas variáveis vão no dashboard do projeto Pages (Settings → Environment variables) — nenhuma delas
é um binding, são env vars normais. Repetir para os ambientes Production e Preview.

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
local com o certificado no disco — não passa pelo Worker nem por uma rota do app:
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

## Fora de escopo desta migração

- **Devolução/estorno de Pix** — a Efí trata isso como fluxo separado
  (`GET /v2/pix/{e2eid}/devolucao`); não foi implementado. Se um cliente pedir reembolso, o estorno
  precisa ser feito manualmente pelo painel da Efí, sem refletir automaticamente no Firestore.
- **CPF do pagador (`devedor`)** — o formulário atual não coleta CPF. O código só envia esse campo à
  Efí se ele existir no pedido. Se o sandbox acusar erro de validação exigindo `devedor`, será
  necessário decidir se um campo de CPF entra no formulário de checkout antes de ir para produção.
