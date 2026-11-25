-- Histórico do chat de suporte do site (/suporte) — aba "Atendimentos" do painel (25/11/2026).
-- Uma linha por conversa (cada vez que o cliente abre o chat). As mensagens ficam numa lista JSON
-- na própria linha; `marcas` resume o que aconteceu (ajuste pago, pagamento, chamou atendente…).

create table if not exists suporte_conversas (
  id uuid primary key,
  order_id text,
  customer_phone text,
  customer_name text,
  mensagens jsonb not null default '[]'::jsonb,
  total_mensagens integer not null default 0,
  marcas text[] not null default '{}',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists suporte_conversas_recentes on suporte_conversas(atualizado_em desc);
create index if not exists suporte_conversas_pedido on suporte_conversas(order_id);
create index if not exists suporte_conversas_telefone on suporte_conversas(customer_phone);
alter table suporte_conversas enable row level security;

-- Acrescenta mensagens a uma conversa (cria se não existir), de forma atômica: duas gravações
-- seguidas da mesma conversa não se sobrescrevem. Teto de 500 mensagens por conversa.
create or replace function suporte_registrar(
  p_id uuid, p_order_id text, p_phone text, p_nome text, p_mensagens jsonb, p_marcas text[]
) returns void language plpgsql security definer set search_path = public as $$
declare v_msgs jsonb := coalesce(p_mensagens, '[]'::jsonb);
begin
  insert into suporte_conversas as c (id, order_id, customer_phone, customer_name, mensagens, total_mensagens, marcas)
  values (p_id, nullif(p_order_id, ''), nullif(p_phone, ''), nullif(p_nome, ''), v_msgs, jsonb_array_length(v_msgs), coalesce(p_marcas, '{}'))
  on conflict (id) do update set
    order_id = coalesce(excluded.order_id, c.order_id),
    customer_phone = coalesce(excluded.customer_phone, c.customer_phone),
    customer_name = coalesce(excluded.customer_name, c.customer_name),
    mensagens = case when c.total_mensagens >= 500 then c.mensagens else c.mensagens || excluded.mensagens end,
    total_mensagens = case when c.total_mensagens >= 500 then c.total_mensagens else c.total_mensagens + excluded.total_mensagens end,
    marcas = array(select distinct m from unnest(c.marcas || excluded.marcas) as m),
    atualizado_em = now();
end $$;

revoke all on function suporte_registrar(uuid, text, text, text, jsonb, text[]) from public, anon, authenticated;
grant execute on function suporte_registrar(uuid, text, text, text, jsonb, text[]) to service_role;
