# Geração de música: dois provedores

Desde 24/09/2026 a música é gerada em **dois provedores**, com fallback automático entre eles.
Quem decide e persiste isso é `src/lib/suno.js:requestSunoGeneration`.

## Quem é quem

| | VPS própria | Kie.ai |
|---|---|---|
| Papel | primária | fallback |
| Código | `src/lib/sunoVps.js` | `src/lib/suno.js:gerarPelaKie` |
| Endpoint | `POST /api/custom_generate` | `POST /api/v1/generate` |
| Auth | header `x-api-key` | `Authorization: Bearer` |
| Identificador | **não tem taskId** — devolve os 2 clipes com `id` cada | `taskId` único |
| Callback | 1 POST **por clipe** | 1 POST por tarefa |
| Áudio | `cdn1.suno.ai` (permanente na conta Suno) | `tempfile.aiquickdraw.com` etc., **apagado em ~14 dias** |
| Custo | créditos do plano da conta Suno | crédito comprado na Kie.ai |

Variáveis: `SUNO_VPS_URL` (precisa ser `https`), `SUNO_VPS_API_KEY`, `MUSIC_PROVIDER_PRIMARY`
(`suno_vps` | `kie`), `KIE_API_KEY`, `KIE_WEBHOOK_SECRET`.

## Por que o fallback não é enfeite

O plano da conta Suno por trás da VPS dá **2.500 créditos/mês** e cada geração consome **10** — cerca
de 250 músicas. O volume do estúdio passa disso em poucos dias. Ou seja: a VPS cobre o começo do
ciclo e a Kie.ai carrega o resto do mês. O caminho "sem crédito" é rotina, não exceção.

A VPS sinaliza isso com `402` e `code: INSUFFICIENT_CREDITS`, tratado em
`src/lib/sunoVps.js:gerarNaVps` como desvio imediato — sem esperar timeout.

`GET /api/status` na VPS devolve o saldo (`consultarSaldoVps`). Fica fora do caminho do cliente de
propósito: a consulta custa ~1s e o `402` já é instantâneo.

## A armadilha dos dois clipes

A Suno sempre gera **duas** variações, e a VPS avisa **uma vez por clipe**. Fechar o pedido no
primeiro aviso entregaria uma única versão a quem pagou por duas — e o segundo aviso sobrescreveria
o campo.

Por isso `/api/suno/webhook-vps` trata o callback como **gatilho, não como fonte**: ignora o corpo
recebido, reconsulta os dois `sunoClipIds` na VPS e só chama `updateTaskResult` quando não há mais
nada por vir (todos prontos, ou os que faltam já falharam). Ver `avaliarClipes`.

Efeito colateral bom: callback forjado não injeta áudio de terceiro, porque o áudio sempre vem de
uma consulta nossa à VPS.

## O que fica gravado, e por quê

- `orders/{id}.sunoProvider` — quem gerou. Sem isso o polling perguntaria à API errada e o cliente
  ficaria em `PROCESSING` para sempre com a música pronta.
- `orders/{id}.sunoClipIds` — os dois clipes (só VPS), que o webhook reconsulta.
- `orders/{id}.sunoTaskId` — na Kie.ai, a tarefa; na VPS, o id do primeiro clipe.
- `suno_tasks/{taskId}.provider` / `.clipIds` — mesma informação do lado da tarefa, usada por
  `/api/suno/status`.

## Playback (add-on instrumental)

A separação vocal continua **100% na Kie.ai**, decisão do dono do estúdio. Como música da VPS não
existe na conta Kie.ai, `src/lib/playback.js` referencia a faixa de duas formas:

- provedor Kie.ai → `taskId` + `audioId`;
- qualquer outro → `audioUrl` + `audioId` (o MP3 no `cdn1.suno.ai` ou a cópia arquivada).

O card do add-on em `/entrega` só aparece quando existe a referência que aquele provedor exige —
ninguém paga por um playback que não teria como sair.

## Arquivamento continua obrigatório

O `cdn1.suno.ai` é permanente **enquanto a conta Suno existir**. O arquivamento no R2
(`src/lib/audioArchive.js`) segue valendo para as duas origens: é o que mantém a entrega
independente de provedor — e foi o que salvou 107 MB de música de cliente em 21/09/2026.

## Como virar a chave

`MUSIC_PROVIDER_PRIMARY` decide quem tenta primeiro, e muda sem deploy de código (mas **exige um
novo build** no Pages para a variável valer). Sem `SUNO_VPS_URL`/`SUNO_VPS_API_KEY`, a escolha cai
para a Kie.ai sozinha — é o que torna o deploy desta arquitetura inerte até alguém configurar.
