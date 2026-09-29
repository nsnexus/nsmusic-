# WhatsApp Cloud API — Envio Transacional Oficial

Canal oficial da Meta configurado para as duas mensagens transacionais críticas que não dependem da janela de 24h:

1. **música pronta** (`musica_pronta`)
2. **pagamento confirmado** (`pagamento_confirmado`)

---

## Identificadores Oficiais em Produção

| Recurso | Identificador | Detalhes |
|---|---|---|
| **App da Meta** | `1663535488712112` | App `nsmusic` |
| **Conta WhatsApp (WABA ID)** | `2160994021495241` | Conta `NS Music` |
| **Identificação do Telefone (Phone Number ID)** | `1266330313237394` | Número: `+55 94 8126-2610` (Cloud API Verificado) |
| **Token de Acesso** | `WHATSAPP_ACCESS_TOKEN` | Token de longa duração (expira em 28/11/2026) |

---

## Como Checar se os Modelos foram Aprovados

### 1. Via Terminal (Mais Rápido)

Execute o script utilitário diretamente no repositório:

```bash
node scripts/check-whatsapp-templates.mjs
```

O script consulta a Graph API da Meta em tempo real e exibe:
- Status de conectividade e verificação do número `+55 94 8126-2610`
- Lista de todos os modelos cadastrados com seus respectivos status (`APPROVED`, `PENDING` ou `REJECTED`)
- ID de cada modelo na Meta e categoria

### 2. Pelo Painel Web da Meta (WhatsApp Manager)

1. Acesse o painel direto da conta WABA:
   [https://business.facebook.com/wa/manage/message-templates/?waba_id=2160994021495241](https://business.facebook.com/wa/manage/message-templates/?waba_id=2160994021495241)
2. Você verá a tabela com os modelos:
   * `musica_pronta`
   * `pagamento_confirmado`
   * `hello_world`
3. A coluna **Status** mostrará:
   * 🟢 **Aprovado (Approved)**: Liberado para envio a qualquer cliente.
   * 🟡 **Pendente (Pending)**: Em análise pelo robô da Meta.
   * 🔴 **Rejeitado (Rejected)**: Requer ajuste de texto/categoria.

---

## Modelos Cadastrados

### 1. `musica_pronta` (ID: `4632637260306709`)

```text
Oi, {{1}}! A música de {{2}} ficou pronta. 🎧

Gravei 2 versões, com arranjos diferentes, pra você escolher. Ouça aqui:
{{3}}

Se precisar de qualquer coisa, chame nosso suporte no WhatsApp:
https://nsmusic.ia.br/whatsapp
```

* **Variáveis**:
  * `{{1}}`: Primeiro nome do cliente (ex.: *Narciso*)
  * `{{2}}`: Nome do homenageado (ex.: *Maria*)
  * `{{3}}`: Link da entrega/prévia (`https://nsmusic.nsnexus.com.br/entrega?orderId=...`)

### 2. `pagamento_confirmado` (ID: `1086325714365526`)

```text
Olá {{1}}, seu pagamento caiu! 🎉 A música de {{2}} tá liberada.

A página completa para ouvir e baixar as 2 versões fica aqui:
{{3}}

Qualquer dúvida ou suporte, é só nos chamar no WhatsApp:
https://nsmusic.ia.br/whatsapp 💜
```

* **Variáveis**:
  * `{{1}}`: Primeiro nome do cliente
  * `{{2}}`: Nome do homenageado
  * `{{3}}`: Link permanente da página de entrega liberada

---

## Como Disparar um Envio de Teste Manual

Quando os modelos estiverem aprovados, teste o disparo direto para o seu WhatsApp executando:

```bash
node -e "
const token = process.env.WHATSAPP_ACCESS_TOKEN || require('fs').readFileSync('.env.local', 'utf8').match(/WHATSAPP_ACCESS_TOKEN=([^\r\n]+)/)[1];
const phoneId = '1266330313237394';

async function send() {
  const res = await fetch('https://graph.facebook.com/v21.0/' + phoneId + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: '5594991064043',
      type: 'template',
      template: {
        name: 'musica_pronta',
        language: { code: 'pt_BR' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: 'Narciso' },
            { type: 'text', text: 'Homenageado' },
            { type: 'text', text: 'https://nsmusic.nsnexus.com.br/entrega?orderId=teste-123' }
          ]
        }]
      }
    })
  });
  console.log(await res.json());
}
send();
"
```

Resposta com `"messages": [{"id": "wamid..."}]` confirma a entrega com sucesso no aparelho do destinatário.
