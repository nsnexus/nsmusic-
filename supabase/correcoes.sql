-- Correções na base do Supabase, apuradas em 26/09/2026 comparando com o Firestore.
-- Rodar no SQL Editor do painel. Cada bloco é independente e pode ser executado sozinho.

-- ============================================================================
-- 1. TELEFONE — o mais urgente, e o que bloqueia desligar o Firestore
-- ============================================================================
-- O telefone está gravado formatado ("(31) 98241-4961") em 5.134 dos 5.162 pedidos, mas o WhatsApp
-- entrega dígitos ("5531982414961"). Medido: busca por dígitos NÃO encontra nada no Supabase.
-- Hoje o bot só acha o cliente porque cai no fallback do Firestore — quando ele sair, a
-- identificação por telefone morre, e com ela o atendimento de "paguei e não recebi".
--
-- Coluna gerada resolve sem backfill e sem mexer em quem escreve: o Postgres mantém os dígitos
-- sozinho, a cada INSERT/UPDATE, para sempre.
alter table orders
  add column if not exists customer_phone_digits text
  generated always as (regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g')) stored;

create index if not exists orders_phone_digits_idx on orders (customer_phone_digits);

-- NOTA: whatsapp_sender_phone NAO existe no Supabase (o espelhamento nao trouxe esse campo, e
-- so 2 pedidos recentes o tinham no Firestore). A busca reversa por ele segue valendo apenas no
-- Firestore; quando virar necessidade, a coluna precisa ser criada e preenchida antes.

-- ============================================================================
-- 2. DOCUMENTOS DE SISTEMA espelhados como pedidos
-- ============================================================================
-- 18 documentos de configuração do Firestore (config_whatsapp, config_stats, config_cotareset_*,
-- session_* do agente) foram copiados para `orders` como se fossem pedidos. Eles inflam contagem,
-- entram nas views e aparecem em qualquer listagem.
delete from orders
where id like 'config\_%' escape '\'
   or id like 'session\_%' escape '\';

-- ============================================================================
-- 3. VIEWS — respeitar exclusão lógica
-- ============================================================================
-- São 108 pedidos com deleted_at preenchido. `producao_por_dia` já filtra; as outras não.
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
join orders o on o.id = p.order_id
where o.deleted_at is null
group by 1
order by 1 desc;

create or replace view cota_por_cliente as
select
  o.customer_phone_digits as telefone,
  count(*)                                                as geracoes_usadas,
  count(*) filter (where o.payment_status in ('PAGO', 'PAGAMENTO_APROVADO')) as compras,
  5 + 5 * count(*) filter (where o.payment_status in ('PAGO', 'PAGAMENTO_APROVADO')) as cota,
  max(o.created_at)                                       as ultimo_pedido_em
from orders o
where o.deleted_at is null
  and o.customer_phone_digits is not null
  and length(o.customer_phone_digits) >= 10
group by 1;

-- ============================================================================
-- 4. DIAGNÓSTICO: pagamentos que faltam
-- ============================================================================
-- 2.174 pedidos com status pago, mas só 2.013 linhas de `payments` do tipo 'musica' — faltam 161.
-- Como o faturamento sai de `payments`, esses ~R$ 1.600 não aparecem em lugar nenhum.
--
-- Esta consulta NÃO corrige, só mostra quem são. A correção depende de saber por que faltam
-- (pedido antigo sem txid, pagamento manual, importação parcial) — inventar linha de pagamento
-- seria inventar faturamento.
select o.id, o.order_number, o.payment_status, o.paid_at, o.created_at
from orders o
left join payments p on p.order_id = o.id and p.kind = 'musica'
where o.payment_status in ('PAGO', 'PAGAMENTO_APROVADO')
  and o.deleted_at is null
  and p.id is null
order by o.paid_at desc nulls last
limit 50;
