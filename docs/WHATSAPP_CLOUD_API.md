# WhatsApp Cloud API — reserva de envio

Configurado em 27/09/2026. **Não é migração**: a Evolution API continua sendo o canal principal,
que conversa com o cliente e recebe mensagem. A Cloud API existe só para garantir as duas
mensagens que não podem faltar quando a Evolution cair:

1. **música pronta**
2. **pagamento confirmado**

O número da Evolution já foi suspenso duas vezes. Quando isso acontece, a pessoa que pagou fica sem
receber o produto — é esse buraco que a Cloud API tapa.

## A regra da Meta que decide todo o desenho

A Meta **não permite** que a empresa inicie conversa com texto livre. Fora da janela de 24 horas
desde a última mensagem do cliente, só passa **template aprovado por eles**.

As nossas duas mensagens são sempre iniciadas por nós: a música fica pronta minutos depois do
pedido, e o pagamento cai quando cai. Ou seja, **as duas precisam ser template**. Por isso
`src/lib/whatsappCloudApi.js` só envia template; texto livre é recusado de propósito, para ninguém
descobrir o limite na hora errada.

## Templates a criar

No painel: **WhatsApp Manager → Modelos de mensagem → Criar modelo**.

- Idioma: **Português (BR)**
- Categoria: **Utilidade** (não Marketing — Utilidade é aprovada mais rápido e não conta como
  marketing para o cliente)

### 1. `musica_pronta`

```
Oi, {{1}}! A música de {{2}} ficou pronta. 🎧

Gravei 2 versões, com arranjos diferentes, pra você escolher. Ouça aqui:
{{3}}

Se precisar de qualquer coisa, chame nosso suporte no WhatsApp:
https://wa.me/5594991081351
```

Variáveis: `{{1}}` primeiro nome do cliente · `{{2}}` homenageado · `{{3}}` link da entrega.

### 2. `pagamento_confirmado`

```
{{1}}, seu pagamento caiu! 🎉 A música de {{2}} tá liberada.

A página completa para ouvir e baixar as 2 versões fica aqui:
{{3}}

Qualquer dúvida ou suporte, é só nos chamar no WhatsApp:
https://wa.me/5594991081351 💜
```

Variáveis: as mesmas.

> A Meta costuma recusar template com link encurtado ou com texto que pareça promoção. Os dois
> acima são de serviço, com link do próprio domínio — é o formato que passa.

Se a Meta obrigar a recriar um template com outro nome, não precisa de deploy: os nomes são lidos de
`WHATSAPP_TEMPLATE_MUSICA` e `WHATSAPP_TEMPLATE_PAGAMENTO`.

## Variáveis de ambiente

No Cloudflare Pages → Settings → Environment variables (**Production**):

| variável | onde achar |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta for Developers → seu app → WhatsApp → Configuração da API. **Gere um token permanente** (o de teste expira em 24h) |
| `WHATSAPP_PHONE_NUMBER_ID` | mesma tela, campo "Identificação do número de telefone" |
| `WHATSAPP_TEMPLATE_MUSICA` | opcional, padrão `musica_pronta` |
| `WHATSAPP_TEMPLATE_PAGAMENTO` | opcional, padrão `pagamento_confirmado` |

Variável no Pages só passa a valer **no deploy seguinte**.

### Token permanente

O token que aparece na tela de configuração expira em 24 horas e serve só para teste. Para produção:
Business Settings → Usuários do sistema → criar usuário do sistema → **Gerar token** com as
permissões `whatsapp_business_messaging` e `whatsapp_business_management`, sem validade.

## Webhook (recebimento)

**Não é necessário para este escopo.** A Cloud API aqui só envia. O endpoint
`/api/whatsapp/webhook` já responde à verificação da Meta (`hub.challenge`, conferindo
`WHATSAPP_WEBHOOK_VERIFY_TOKEN`), mas o corpo das mensagens recebidas ainda é lido no formato da
Evolution API.

Se um dia a Cloud API virar o canal principal, o parser precisa ser escrito antes: os formatos não
se parecem.

```
Evolution:  data.key.remoteJid          data.message.conversation
Meta:       entry[].changes[].value.messages[].from    .text.body
```

Apontar a Meta para o webhook hoje faria as mensagens chegarem e serem descartadas como
`empty_content` — o agente ficaria mudo sem erro nenhum aparecendo.

## Como testar sem esperar a Evolution cair

Com as variáveis configuradas e os templates aprovados, um envio direto:

```bash
curl -X POST "https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "5594991064043",
    "type": "template",
    "template": {
      "name": "musica_pronta",
      "language": { "code": "pt_BR" },
      "components": [{
        "type": "body",
        "parameters": [
          { "type": "text", "text": "Narciso" },
          { "type": "text", "text": "Dona Léo" },
          { "type": "text", "text": "https://nsmusic.ia.br/entrega?orderId=teste" }
        ]
      }]
    }
  }'
```

Resposta com `"messages": [{"id": "wamid..."}]` significa aceito. Erro comum: `(#132001) Template
name does not exist` — o template ainda não foi aprovado, ou o nome/idioma não batem.
