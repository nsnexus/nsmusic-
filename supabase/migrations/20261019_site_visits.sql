-- Tabela para rastreamento de acessos/visitas ao site por plataforma
-- Executar no SQL Editor do Supabase se desejar persistir o histórico de visitantes que não iniciaram o pedido.

create table if not exists site_visits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text,
  platform text not null default 'direto',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  page_path text,
  referrer text
);

create index if not exists idx_site_visits_created_at on site_visits (created_at desc);
create index if not exists idx_site_visits_platform on site_visits (platform);
create index if not exists idx_site_visits_created_platform on site_visits (created_at desc, platform);
create index if not exists idx_site_visits_session on site_visits (session_id);
