# Respostas automáticas no WhatsApp ADM

O número ADM (atendimento) é uma **segunda instância** na mesma Evolution API do número de disparo.
O menu de boas-vindas (1 a 5) é do próprio WhatsApp Business; o site trata só duas respostas:

| Cliente manda | O site faz |
|---|---|
| `3` | Procura os pedidos **pagos** do telefone e envia até 6 MP3 como documento, na conversa. Sem pedido pago: silêncio (fica registrado no painel). Repetir o `3` em menos de 5 min não reenvia. |
| `4` | Envia o link de `/criar`. |
| qualquer outra coisa | Nada. |

- Painel: `/admin/automacao` → aba **WhatsApp ADM** (ligar/desligar, QR code, últimas respostas).
- Código: `src/lib/whatsappAdm.js`, `src/app/api/whatsapp/adm/webhook/[segredo]/route.js`,
  `src/app/api/admin/whatsapp-adm/route.js`.
- Configuração: tabela `config`, chave `whatsapp_adm`. Endereço e chave da Evolution vêm da
  configuração principal (`EVOLUTION_API_URL` / `EVOLUTION_API_KEY` ou `config.evolution`).
- O webhook é protegido por um segredo no caminho da URL, gerado pelo painel.

## Se o botão "Conectar número" não conseguir criar a instância

A chave salva pode ser de instância, sem permissão de criar outras. Nesse caso, no painel da
Evolution: criar a instância `nsmusic-adm`, cadastrar o webhook mostrado na aba (evento
`MESSAGES_UPSERT`) e voltar ao painel do site para ler o QR code.

## Não verificado

Os endpoints da Evolution (`/instance/create`, `/instance/connect`, `/webhook/set`) foram escritos
para a v2 e **não foram testados contra a VPS real**.
