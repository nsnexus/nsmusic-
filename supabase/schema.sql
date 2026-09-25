-- Schema do NS Music no Postgres (Supabase) — fase 1 da migração.
--
-- Escrito a partir do levantamento dos 3.200 pedidos reais no Firestore (25/09/2026), não do que o
-- código sugere existir. O que apareceu lá e virou decisão aqui:
--
--   - Toda data é string ISO (100% dos casos), nunca Timestamp nativo. Vira timestamptz.
--   - Os únicos campos com mais de um tipo são null vs texto (userId, sunoError,
--     audioArchiveFailedAt, audioRefreshFailed, playbackError) — todos viram colunas nullable.
--   - `audioFiles`/`audioIds`/`wavFiles` são listas: viram text[].
--   - `paymentIntentSkuByTxid`/`paymentIntentAmountByTxid` são mapas txid->valor: viram a tabela
--     `payments`, que é o ponto principal deste schema (ver abaixo).
--
-- POR QUE UMA TABELA DE PAGAMENTOS: no Firestore cada pagamento virou um punhado de campos soltos
-- no pedido (paymentId/paidAt/videoPaidAt/cartaPaidAt/...), e o valor pago não era gravado em lugar
-- nenhum até 25/09/2026 — o painel adivinhava o faturamento a partir de `expectedAmount`, que
-- guarda só a ÚLTIMA cobrança criada. Com uma linha por transação, faturamento vira SUM() e para de
-- ser estimativa.

-- ============================================================================
-- orders
-- ============================================================================
create table if not exists orders (
  -- Mesmo id do documento no Firestore: é o que os links já enviados por WhatsApp carregam
  -- (/entrega?orderId=...). Trocar por uuid quebraria todo link em circulação.
  id                text primary key,
  order_number      text not null,

  -- Cliente (PII)
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  user_id           text,

  -- Briefing
  honoree_name      text,
  recipient_type    text,
  relationship      text,
  occasion          text,
  story             text,
  important_moments text,
  music_style       text,
  music_mood        text,
  voice_type        text,
  lyrics            text,
  suno_prompt       text,

  -- Produção
  production_status text not null default 'RASCUNHO',
  suno_task_id      text,
  suno_provider     text,
  suno_generation_count integer not null default 0,
  suno_requested_at timestamptz,
  suno_error        text,
  audio_url         text,
  audio_files       text[] not null default '{}',
  audio_ids         text[] not null default '{}',
  cover_url         text,

  -- Arquivamento no nosso storage (R2)
  audio_archived_at        timestamptz,
  audio_archive_failed_at  timestamptz,
  audio_refreshed_at       timestamptz,
  audio_refresh_failed     text,

  -- Pagamento (estado atual; o histórico de transações vive em `payments`)
  payment_status    text not null default 'AGUARDANDO_PAGAMENTO',
  paid_at           timestamptz,

  -- Acesso a produto pago. Ficam no pedido de propósito: é o que a tela consulta para liberar, e
  -- derivar isso de `payments` a cada render sairia caro sem ganho.
  has_video_access          boolean not null default false,
  has_carta_access          boolean not null default false,
  has_retrospectiva_access  boolean not null default false,
  has_playback_access       boolean not null default false,

  -- Entregáveis dos add-ons
  video_url             text,
  video_status          text,
  video_error           text,
  playback_url          text,
  playback_status       text,
  playback_error        text,
  carta_texto           text,
  carta_tema_escolhido  text,
  carta_musica_url      text,
  homenagem_musica_url  text,
  retrospectiva         jsonb,
  slideshow_images      text[] not null default '{}',

  -- WhatsApp: idempotência de envio
  whatsapp_requested      boolean not null default false,
  whatsapp_sent           boolean not null default false,
  whatsapp_sent_at        timestamptz,
  ready_template_sent     boolean not null default false,
  ready_template_sent_at  timestamptz,
  payment_whatsapp_sent   boolean not null default false,
  recovery_stage          integer not null default 0,
  human_takeover          boolean not null default false,

  -- Engajamento
  preview_listened_at   timestamptz,
  terms_accepted        boolean not null default false,
  terms_accepted_at     timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Exclusão é lógica, como já é no Firestore.
  deleted_at  timestamptz,

  -- Campos que ainda não têm coluna própria. Evita perder dado no espelhamento e serve de fila de
  -- trabalho: quando um deles virar consulta, vira coluna.
  extras jsonb not null default '{}'::jsonb
);

-- Consultas que o painel faz hoje. Sem estes índices, cada relatório vira varredura da tabela.
create index if not exists orders_created_at_idx  on orders (created_at desc) where deleted_at is null;
create index if not exists orders_paid_at_idx     on orders (paid_at desc)    where paid_at is not null;
create index if not exists orders_phone_idx       on orders (customer_phone)  where deleted_at is null;
create index if not exists orders_status_idx      on orders (payment_status, created_at desc);
create index if not exists orders_producao_idx    on orders (production_status, created_at desc);
create unique index if not exists orders_number_idx on orders (order_number);

-- ============================================================================
-- payments — uma linha por transação confirmada
-- ============================================================================
create table if not exists payments (
  id          bigint generated always as identity primary key,
  order_id    text not null references orders(id) on delete cascade,

  -- O que foi comprado nesta transação.
  kind        text not null check (kind in ('musica', 'video', 'carta', 'retrospectiva', 'playback')),
  sku         text,

  -- txid da Efí. Único: é a defesa contra o mesmo pagamento ser aplicado duas vezes quando webhook
  -- e polling chegam juntos — hoje isso é feito comparando campos soltos no documento.
  txid        text not null,

  -- Valor REALMENTE confirmado pelo provedor, nunca o que o cliente pediu.
  amount      numeric(10,2) not null,
  paid_at     timestamptz not null,
  created_at  timestamptz not null default now(),

  unique (txid, kind)
);

create index if not exists payments_order_idx    on payments (order_id);
create index if not exists payments_paid_at_idx  on payments (paid_at desc);

-- ============================================================================
-- suno_tasks
-- ============================================================================
create table if not exists suno_tasks (
  id          text primary key,
  order_id    text references orders(id) on delete set null,
  status      text not null,
  provider    text,
  clip_ids    text[] not null default '{}',
  result      jsonb,
  retry_task_id text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists suno_tasks_order_idx on suno_tasks (order_id);

-- ============================================================================
-- Relatórios: o que hoje baixa milhares de documentos para somar no navegador
-- ============================================================================

-- Vendas e faturamento por dia. Substitui a consulta que lia até 3.000 pedidos por abertura do
-- painel — e que, por usar limit com ordem crescente, escondia justamente os dias mais recentes.
create or replace view vendas_por_dia as
select
  (p.paid_at at time zone 'America/Sao_Paulo')::date as dia,
  count(*) filter (where p.kind = 'musica')        as musicas,
  count(*) filter (where p.kind = 'video')         as videos,
  count(*) filter (where p.kind = 'carta')         as cartas,
  count(*) filter (where p.kind = 'retrospectiva') as retrospectivas,
  count(*) filter (where p.kind = 'playback')      as playbacks,
  count(distinct p.order_id)                       as pedidos_pagos,
  sum(p.amount)                                    as faturamento
from payments p
group by 1
order by 1 desc;

-- Pedidos criados e gerações por dia (custo), para cruzar com a conversão.
create or replace view producao_por_dia as
select
  (o.created_at at time zone 'America/Sao_Paulo')::date as dia,
  count(*)                          as pedidos_criados,
  sum(o.suno_generation_count)      as geracoes,
  count(*) filter (where o.paid_at is not null) as converteram
from orders o
where o.deleted_at is null
group by 1
order by 1 desc;

-- Cota de gerações por cliente (ver src/lib/cotaGeracoes.js). No Firestore isso exige ler todos os
-- pedidos e agrupar no cliente; aqui é uma linha de SQL.
create or replace view cota_por_cliente as
select
  o.customer_phone,
  count(*)                                                as geracoes_usadas,
  count(*) filter (where o.payment_status in ('PAGO', 'PAGAMENTO_APROVADO')) as compras,
  5 + 5 * count(*) filter (where o.payment_status in ('PAGO', 'PAGAMENTO_APROVADO')) as cota,
  max(o.created_at)                                       as ultimo_pedido_em
from orders o
where o.deleted_at is null
  and o.customer_phone is not null
  and length(o.customer_phone) >= 10
group by 1;

-- ============================================================================
-- RLS: nada de acesso anônimo. As rotas Edge usam a service_role key, que ignora RLS.
--
-- É a diferença central em relação ao Firestore deste projeto: lá as rotas de API acessam o banco
-- com o MESMO SDK anônimo do navegador, sem privilégio nenhum — a raiz das vulnerabilidades abertas
-- e o motivo de a consolidação de métricas ter ficado semanas quebrada.
-- ============================================================================
alter table orders     enable row level security;
alter table payments   enable row level security;
alter table suno_tasks enable row level security;
