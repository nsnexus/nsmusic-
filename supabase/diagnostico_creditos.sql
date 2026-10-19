-- SOMENTE LEITURA: estrutura de creditos e dependencias, sem dados de clientes.
-- Execute no SQL Editor e compartilhe o resultado antes de aplicar a migracao.
select 'coluna' as tipo, table_name as objeto, column_name as detalhe,
       data_type as definicao
from information_schema.columns
where table_schema = 'public'
  and table_name in ('credit_accounts', 'credit_purchases', 'credit_ledger',
                    'referrals', 'orders', 'payments', 'order_payment_intents',
                    'order_claim_codes')
union all
select 'funcao', p.proname, pg_get_function_identity_arguments(p.oid),
       pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('ensure_credit_account', 'approve_credit_purchase',
                   'reward_referral_for_order', 'redeem_credits_for_order',
                   'customer_credit_summary', 'attach_referral_to_customer',
                   'claim_order_for_customer', 'customer_second_song_offer',
                   'reserve_credit_purchase', 'reserve_order_payment',
                   'record_order_payment_intent', 'reserve_order_claim_code',
                   'verify_order_claim_code', 'reconcile_pending_referrals')
order by tipo, objeto, detalhe;
