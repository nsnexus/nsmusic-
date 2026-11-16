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
