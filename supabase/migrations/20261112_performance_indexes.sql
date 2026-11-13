-- ============================================================================
-- Migração de Performance: Índices de Otimização para Consultas Frequentes
-- Data: 12/11/2026
-- ============================================================================

-- 1. Índice em orders(suno_task_id)
-- Elimina a varredura sequencial (Seq Scan) da tabela orders no recebimento de
-- webhooks da Suno/Kie.ai (/api/suno/webhook) e no polling (/api/suno/status).
CREATE INDEX IF NOT EXISTS orders_suno_task_id_idx 
ON orders (suno_task_id) 
WHERE suno_task_id IS NOT NULL;

-- 2. Índice funcional para busca de pedidos relacionados/2ª geração via parentOrderId
-- Acelera a consulta em /api/orders/[id] evitando varredura JSONB completa.
CREATE INDEX IF NOT EXISTS orders_parent_order_id_idx 
ON orders ((extras->>'parentOrderId')) 
WHERE extras->>'parentOrderId' IS NOT NULL;

