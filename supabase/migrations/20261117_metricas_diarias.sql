-- Métricas consolidadas por dia (fuso de Brasília), para o widget e relatórios não precisarem
-- recalcular a partir dos pedidos toda vez. Preenchida pelo app (src/lib/metricasDiarias.js):
-- hoje é recalculado a cada 5 min quando alguém pede; dias passados ficam guardados.
create table if not exists metricas_diarias (
  dia              date primary key,
  faturamento      numeric(12,2) not null default 0,  -- mesmas contas do Dashboard
  vendas           integer       not null default 0,
  pedidos_criados  integer       not null default 0,
  musicas_geradas  integer       not null default 0,
  gasto_kie        numeric(12,2) not null default 0,
  gasto_whatsapp   numeric(12,2) not null default 0,
  -- Curvas do card "Ritmo de vendas" (24 valores, um por hora)
  receita_hora     jsonb         not null default '[]'::jsonb,  -- receita líquida pela hora do pagamento
  criados_hora     jsonb         not null default '[]'::jsonb,  -- músicas geradas pela hora de criação
  pagos_hora       jsonb         not null default '[]'::jsonb,  -- pagos pela hora de criação (coorte)
  tem_receita      boolean       not null default false,
  tem_coorte       boolean       not null default false,
  calculado_em     timestamptz   not null default now()
);

-- Só o servidor (chave de serviço) lê e grava.
alter table metricas_diarias enable row level security;
