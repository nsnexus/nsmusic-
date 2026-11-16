# Automação de comentários do Instagram

Tela: `/admin/automacao` (abas **Posts e comentários**, **Automação com IA**, **Conexão**).

## O que faz

- Lista os posts/reels recentes do perfil e as mídias dos **anúncios ativos**, com os comentários de cada um.
- Ações manuais por comentário: responder (com sugestão da IA), ocultar/mostrar, apagar.
- Automação: a IA lê cada comentário novo e decide entre **responder em público**, **ocultar**
  (palavrão, ofensa, spam, golpe) ou **deixar passar**. Crítica e reclamação nunca são ocultadas.

## Peças

| Arquivo | Papel |
|---|---|
| `src/lib/instagramGraph.js` | Chamadas à Graph API (listar mídias, anúncios, comentários; responder, ocultar, apagar) |
| `src/lib/instagramAutomacao.js` | Configuração, travas, prompt da IA e a passada (`executarAutomacao`) |
| `src/app/api/admin/instagram/*` | Rotas do painel (`posts`, `comments`, `config`) — todas com `requireAdmin` |
| `src/app/api/cron/instagram-comments` | Uma passada: `CRON_SECRET` ou sessão de admin ("Rodar agora" / "Testar agora") |
| `src/app/api/cron/recover` | Chama a passada de carona, a cada 15 min (Pages não tem cron próprio) |

Dados na tabela `config` do Supabase: `instagram_automation` (configuração, inclui o token) e
`instagram_automation_state` (comentários já tratados, contagens por post, histórico). Não há tabela nova.

## Travas

- Só responde comentário feito **depois** de a automação ser ligada.
- Teto de comentários por passada (padrão 8) e prazo de tempo por passada.
- Não responde comentário oculto, nosso, ou que já tenha resposta nossa (lido do próprio Instagram).
- Cada comentário é decidido uma vez; falha passageira (IA fora, limite da Meta) tenta de novo depois.
- "Testar agora" simula sobre os últimos 7 dias sem publicar nem gravar nada.

## Token

Usa o token próprio salvo na aba Conexão ou, na falta, o do painel de Anúncios (`meta_ads_config`).
Permissões: `instagram_basic`, `instagram_manage_comments`, `pages_show_list`,
`pages_read_engagement` e, para comentários de anúncios, `ads_read`. A aba Conexão mostra quais faltam.

## Limites da API da Meta

- **Não existe curtir comentário** pela API do Instagram (só em Página do Facebook).
- Só se responde comentário de primeiro nível; não se responde comentário oculto.
- Comentários de anúncios de catálogo Advantage+ não são acessíveis.
- Sem webhook nesta versão: a leitura é por consulta a cada 15 min, não instantânea.

---

# Publicação diária a partir do Google Drive

Aba **Publicações** de `/admin/automacao`.

## Como funciona

1. Na pasta raiz configurada, cada dia tem uma subpasta `AAAA-MM-DD` com as imagens em **.jpg** e um
   `legenda.txt` (hoje quem monta é o ChatGPT). Uma imagem = foto; várias = carrossel, na ordem do nome.
2. A cada 15 min (de carona no `/api/cron/recover`), a partir do horário configurado (fuso de
   Brasília), `executarPublicacao` lê a pasta do dia e publica. Pasta atrasada sai assim que chegar,
   no mesmo dia.
3. O Instagram só publica imagem que ele mesmo baixe de uma URL pública. A rota
   `/api/instagram/midia` serve um arquivo do Drive por vez, com link assinado (HMAC com
   `CRON_SECRET`, validade de 30 min). A pasta do Drive continua privada.

## Peças

| Arquivo | Papel |
|---|---|
| `src/lib/googleDrive.js` | Leitura do Drive com conta de serviço (JWT RS256 via WebCrypto, escopo somente leitura) |
| `src/lib/instagramPublicacao.js` | Configuração, leitura da pasta do dia, link assinado e a publicação |
| `src/app/api/admin/instagram/publicacao` | Painel: configuração, conferência da pasta, "Publicar agora", liberar dia |
| `src/app/api/instagram/midia` | Rota **pública** com assinatura, para a Meta baixar a imagem |

Dados na tabela `config`: `instagram_publicacao` (inclui a chave da conta de serviço) e
`instagram_publicacao_state` (um registro por dia).

## Nunca publicar duas vezes

O dia é marcado `iniciada` antes de qualquer chamada de publicação. Falha **antes** de publicar
(pasta com problema, container recusado) vira `erro` e é repetida até 3 vezes. Falha **na** chamada
de publicação mantém `iniciada`: o post pode ter saído, então nada repete sozinho — o dono confere o
perfil e libera o dia no painel.

## Limites

- Só imagem JPG, até 8 MB, até 10 por carrossel; legenda até 2.200 caracteres. Sem vídeo/reels/stories.
- Permissão extra no token: `instagram_content_publish`.
- Precisão do horário: até 15 min depois do horário configurado.
