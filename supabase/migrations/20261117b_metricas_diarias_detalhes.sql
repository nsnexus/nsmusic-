-- Detalhes de cada dia para os cards do Dashboard (vendas por produto, horário, estado, plataformas
-- e gerados x convertidos), montados por src/lib/dashboardAgregados.js:montarDetalhesDia.
alter table metricas_diarias add column if not exists detalhes jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
