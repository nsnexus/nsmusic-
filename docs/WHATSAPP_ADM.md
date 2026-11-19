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

## Jeito humano (Evolution)

Para diminuir o risco de restrição por automação no número não oficial (`src/lib/humanizar.js`):

- marca a mensagem do cliente como **lida** e espera 1,5–3,5 s antes de responder (só quando vai responder);
- **"digitando…"** proporcional ao texto (campo `delay` da Evolution), **"gravando áudio…"** antes de cada áudio;
- **pausa aleatória** de 2,5–5 s entre uma música e outra;
- **textos sorteados** entre 3 versões (opções 1, 4 e 5);
- **teto de 60 arquivos por hora** (MP3 + áudio): acima disso o robô só diz que já já manda; o dono envia depois com `/musicas`;
- com as pausas, várias músicas passam dos ~30 s de segundo plano da Cloudflare: o que sobrar segue
  numa nova requisição para `/api/whatsapp/adm/continuar/[segredo]` (mesmo segredo do webhook).
- O número que dispara as mensagens do site também manda texto com "digitando…" (até 3,5 s) e mídia com um pequeno atraso.

## Se o botão "Conectar número" não conseguir criar a instância

A chave salva pode ser de instância, sem permissão de criar outras. Nesse caso, no painel da
Evolution: criar a instância `nsmusic-adm`, cadastrar o webhook mostrado na aba (evento
`MESSAGES_UPSERT`) e voltar ao painel do site para ler o QR code.

## Não verificado

Os endpoints da Evolution (`/instance/create`, `/instance/connect`, `/webhook/set`) foram escritos
para a v2 e **não foram testados contra a VPS real**.


---

## Canal oficial da Meta (recomendado)

Em 17/11/2026 o WhatsApp **restringiu o número ADM por 24 h** ("atividade pode caracterizar mensagens
automáticas") no meio de um envio de MP3 + áudio feito pela Evolution (QR code, não oficial); a conexão
caiu e só 1 de 2 arquivos chegou. Para não repetir, o robô pode falar pela **Cloud API oficial**.

- **Ativa** quando `WHATSAPP_ADM_PHONE_NUMBER_ID` está definida (ver `.env.example`). Sem ela, tudo
  continua pela Evolution como antes.
- O número continua no **app WhatsApp Business** (coexistência): o dono segue atendendo pelo celular.
- O cliente escreve primeiro ("3"), o que abre a janela de 24 h da Meta; dentro dela o robô manda
  texto e áudio sem template. Não há template nesse fluxo.
- Cada música vai como **áudio** (a Meta não aceita MP3 como documento): o cliente toca, baixa e
  encaminha. Com mais de uma música, um texto "Música 1 de 2" vem antes de cada áudio.
- O envio para antes de ~22 s e avisa "Mandei X de Y" (o trabalho em segundo plano da Cloudflare dura
  ~30 s). Mandar "3" de novo depois de 5 min recebe o restante.
- **Fora desta versão:** o atalho do dono `/musicas` (as mensagens que o dono manda pelo app chegam por
  outro evento e a API não apaga o comando) e o botão de QR code do painel (mostra o aviso de canal oficial).

### Passo a passo na Meta

1. **Colocar o número na conta da Meta com coexistência.** No WhatsApp Manager da conta `NS Music`,
   adicionar o número ADM escolhendo conectar um número que **já usa o app WhatsApp Business** (escanear o
   QR code que a Meta mostra no app do celular). Mantém o app funcionando junto com a API.
2. **Copiar o Phone Number ID** do número ADM (WhatsApp Manager > Números) para
   `WHATSAPP_ADM_PHONE_NUMBER_ID`. O token (`WHATSAPP_ACCESS_TOKEN`) serve se o número estiver na mesma
   conta; senão gere um token do System User dessa conta e use `WHATSAPP_ADM_ACCESS_TOKEN`.
3. **Copiar o App Secret** (Configurações do app > Básico) para `WHATSAPP_APP_SECRET`.
4. **Webhook:** o app já aponta para `/api/whatsapp/webhook`, que também entrega as mensagens do ADM ao
   robô (basta o campo `messages` estar assinado). Se preferir isolar, configure o número ADM com
   override de webhook para `/api/whatsapp/adm/cloud` (mesmo `WHATSAPP_WEBHOOK_VERIFY_TOKEN`).
5. No painel `/admin/automacao` > **WhatsApp ADM**, deixar a automação **ligada**.

Segurança: toda chamada da Meta é conferida pela assinatura `X-Hub-Signature-256` com o App Secret;
sem o segredo configurado o webhook responde 500 e não envia nada.

### Não verificado

Escrito contra a documentação da Graph API v21.0 e coberto por testes unitários com a Meta simulada.
**Não foi testado contra a Meta real**: confirmar com um "3" do seu próprio telefone antes de ligar para clientes.
