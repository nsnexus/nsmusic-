-- Incremental migration over the EXISTING credits schema; do NOT rerun credits.sql.
-- Verify the deployed schema first. Run BEFORE deploying experience v2.
-- Rollback: revert application/UI; keep tables, pending PIX and ledger for reconciliation.
begin;
set local search_path = public;

-- Refuse to bootstrap a missing base: this update only extends existing credits.
do $$
begin
  if to_regclass('public.credit_accounts') is null
    or to_regclass('public.credit_purchases') is null
    or to_regclass('public.credit_ledger') is null
    or to_regclass('public.referrals') is null
    or to_regclass('public.orders') is null
    or to_regclass('public.payments') is null then
    raise exception 'Base existente incompleta. Nao aplique credits.sql automaticamente; confira o diagnostico.';
  end if;
end $$;

alter table credit_purchases drop constraint if exists credit_purchases_package_sku_check;
alter table credit_purchases add constraint credit_purchases_package_sku_check
  check (package_sku in ('creditos_1','creditos_5','creditos_10','creditos_pos_compra_1'));
alter table credit_purchases add column if not exists source_order_id text references orders(id);
alter table credit_purchases add column if not exists request_key text;
alter table credit_purchases add column if not exists qr_code text;
create unique index if not exists credit_purchase_request_key on credit_purchases(user_id,request_key) where request_key is not null;
create unique index if not exists credit_post_purchase_once on credit_purchases(user_id) where package_sku = 'creditos_pos_compra_1';

create table if not exists order_payment_intents (
  id uuid primary key default gen_random_uuid(), order_id text not null references orders(id),
  sku text not null, expected_amount numeric(10,2) not null check (expected_amount > 0),
  txid text not null unique, qr_code text, provider text not null default 'efi',
  created_at timestamptz not null default now()
);
create index if not exists order_payment_intent_lookup on order_payment_intents(order_id,sku,created_at desc);
alter table order_payment_intents enable row level security;

create or replace function ensure_credit_account(p_user_id uuid)
returns credit_accounts language plpgsql security definer set search_path=public as $$
declare v_account credit_accounts%rowtype; v_attempt integer; begin
  perform pg_advisory_xact_lock(hashtext('account:'||p_user_id::text));
  select * into v_account from credit_accounts where user_id=p_user_id;
  if found then return v_account; end if;
  for v_attempt in 1..5 loop
    begin
      insert into credit_accounts(user_id,referral_code) values(p_user_id,lower(substr(replace(gen_random_uuid()::text,'-',''),1,10))) returning * into v_account;
      return v_account;
    exception when unique_violation then
      select * into v_account from credit_accounts where user_id=p_user_id;
      if found then return v_account; end if;
    end;
  end loop;
  raise exception 'account_creation_failed';
end $$;

create or replace function customer_credit_summary(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance numeric; v_total integer; v_rewarded integer; v_earned numeric; begin
  select coalesce(sum(amount),0) into v_balance from credit_ledger where user_id=p_user_id;
  select count(*), count(*) filter(where rewarded_at is not null) into v_total,v_rewarded from referrals where referrer_user_id=p_user_id;
  select coalesce(sum(amount),0) into v_earned from credit_ledger where user_id=p_user_id and reason in ('indicacao','bonus_indicacoes');
  return jsonb_build_object('balance',v_balance,'total',v_total,'rewarded',v_rewarded,'earnedCredits',v_earned);
end $$;

create or replace function attach_referral_to_customer(p_user_id uuid,p_code text)
returns void language plpgsql security definer set search_path = public as $$
declare v_referrer uuid; begin
  perform pg_advisory_xact_lock(hashtext('referee:'||p_user_id::text));
  select user_id into v_referrer from credit_accounts where referral_code=lower(trim(p_code));
  if v_referrer is null or v_referrer=p_user_id then return; end if;
  -- Attribution cannot be rewritten, including after a previous paid order.
  if exists(select 1 from orders where user_id=p_user_id::text and payment_status in ('PAGO','PAGAMENTO_APROVADO')) then return; end if;
  insert into referrals(referee_user_id,referrer_user_id) values(p_user_id,v_referrer) on conflict(referee_user_id) do nothing;
end $$;

create or replace function claim_order_for_customer(p_user_id uuid,p_order_id text,p_claim_hash text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_order orders%rowtype; v_referrer uuid; begin
  select * into v_order from orders where id=p_order_id and deleted_at is null for update;
  if not found then return jsonb_build_object('claimed',false); end if;
  if v_order.user_id=p_user_id::text then return jsonb_build_object('claimed',true); end if;
  if v_order.user_id is not null or length(coalesce(p_claim_hash,''))<>64 or coalesce(v_order.extras->>'ownerClaimHash','')<>p_claim_hash then
    return jsonb_build_object('claimed',false);
  end if;
  update orders set user_id=p_user_id::text,updated_at=now() where id=p_order_id;
  -- Preserve the original invitation captured at creation, even when payment preceded login.
  select user_id into v_referrer from credit_accounts where referral_code=v_order.extras->>'referralCode';
  if v_referrer is not null and v_referrer<>p_user_id and not exists(
    select 1 from orders where user_id=p_user_id::text and id<>p_order_id and payment_status in ('PAGO','PAGAMENTO_APROVADO')
  ) then
    insert into referrals(referee_user_id,referrer_user_id) values(p_user_id,v_referrer) on conflict(referee_user_id) do nothing;
  end if;
  return jsonb_build_object('claimed',true);
end $$;

create or replace function customer_second_song_offer(p_user_id uuid,p_order_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_purchase credit_purchases%rowtype; begin
  if not exists(select 1 from orders o where o.id=p_order_id and o.user_id=p_user_id::text and o.deleted_at is null
    and o.payment_status in ('PAGO','PAGAMENTO_APROVADO') and exists(
      select 1 from payments p where p.order_id=o.id and p.kind='musica' and p.amount>0
    )) then return jsonb_build_object('eligible',false,'reason','pedido_nao_elegivel'); end if;
  select * into v_purchase from credit_purchases where user_id=p_user_id and package_sku='creditos_pos_compra_1';
  if found and v_purchase.status='APROVADO' then return jsonb_build_object('eligible',false,'purchased',true); end if;
  return jsonb_build_object('eligible',true,'pending',v_purchase.id is not null);
end $$;

create or replace function reserve_credit_purchase(p_user_id uuid,p_sku text,p_order_id text,p_request_key text,p_txid text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_purchase credit_purchases%rowtype; v_price numeric; v_credits numeric; v_offer jsonb; begin
  perform pg_advisory_xact_lock(hashtext('credit-purchase:'||p_user_id::text));
  if p_request_key is null or length(p_request_key)>100 or p_txid !~ '^[A-Za-z0-9]{26,35}$' then raise exception 'invalid_request'; end if;
  select * into v_purchase from credit_purchases where user_id=p_user_id and request_key=p_request_key;
  if found then return to_jsonb(v_purchase); end if;
  case p_sku
    when 'creditos_1' then v_price:=9.99;v_credits:=1;
    when 'creditos_5' then v_price:=29.90;v_credits:=5;
    when 'creditos_10' then v_price:=49.90;v_credits:=10;
    when 'creditos_pos_compra_1' then
      v_offer:=customer_second_song_offer(p_user_id,p_order_id);
      if not coalesce((v_offer->>'eligible')::boolean,false) then raise exception 'offer_not_eligible'; end if;
      select * into v_purchase from credit_purchases where user_id=p_user_id and package_sku=p_sku;
      if found then return to_jsonb(v_purchase); end if;
      v_price:=4.99;v_credits:=1;
    else raise exception 'invalid_sku';
  end case;
  -- Reuse a recently pending charge for the same package, including request retries.
  select * into v_purchase from credit_purchases where user_id=p_user_id and package_sku=p_sku and status='PENDENTE'
    and created_at>now()-interval '55 minutes' order by created_at desc limit 1;
  if found then return to_jsonb(v_purchase); end if;
  insert into credit_purchases(user_id,package_sku,credits,expected_amount,txid,source_order_id,request_key)
    values(p_user_id,p_sku,v_credits,v_price,p_txid,case when p_sku='creditos_pos_compra_1' then p_order_id else null end,p_request_key)
    returning * into v_purchase;
  return to_jsonb(v_purchase);
end $$;

create or replace function reserve_order_payment(p_order_id text,p_sku text,p_amount numeric,p_txid text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_intent order_payment_intents%rowtype; begin
  perform pg_advisory_xact_lock(hashtext('pix:'||p_order_id));
  if not exists(select 1 from orders where id=p_order_id and deleted_at is null) then raise exception 'order_not_found'; end if;
  select * into v_intent from order_payment_intents where order_id=p_order_id and sku=p_sku
    and abs(expected_amount-p_amount)<0.01 and created_at>now()-interval '55 minutes' order by created_at desc limit 1;
  if found then return to_jsonb(v_intent); end if;
  insert into order_payment_intents(order_id,sku,expected_amount,txid) values(p_order_id,p_sku,p_amount,p_txid) returning * into v_intent;
  return to_jsonb(v_intent);
end $$;

-- A single referrer-level lock serializes milestones across different referred customers.
create or replace function reward_referral_for_order(p_order_id text,p_referee_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_ref referrals%rowtype; v_count integer; v_order orders%rowtype; begin
  select * into v_ref from referrals where referee_user_id=p_referee_user_id;
  if not found then return jsonb_build_object('awarded',false); end if;
  perform pg_advisory_xact_lock(hashtext('referrer:'||v_ref.referrer_user_id::text));
  select * into v_ref from referrals where referee_user_id=p_referee_user_id for update;
  if v_ref.rewarded_at is not null then return jsonb_build_object('awarded',false); end if;
  select * into v_order from orders where id=p_order_id and user_id=p_referee_user_id::text and deleted_at is null
    and payment_status in ('PAGO','PAGAMENTO_APROVADO');
  if not found or not exists(select 1 from payments where order_id=p_order_id and kind='musica' and amount>0)
    then return jsonb_build_object('awarded',false); end if;
  -- Old purchasers cannot become new referrals by making an additional order.
  if exists(select 1 from orders o join payments p on p.order_id=o.id and p.kind='musica'
    where o.user_id=p_referee_user_id::text and o.id<>p_order_id and o.payment_status in ('PAGO','PAGAMENTO_APROVADO')
    and o.paid_at<v_order.paid_at) then return jsonb_build_object('awarded',false); end if;
  perform ensure_credit_account(v_ref.referrer_user_id);
  update referrals set qualifying_order_id=p_order_id,rewarded_at=now() where referee_user_id=p_referee_user_id;
  insert into credit_ledger(user_id,amount,reason,order_id,sku) values(v_ref.referrer_user_id,1,'indicacao',p_order_id,'referral');
  select count(*) into v_count from referrals where referrer_user_id=v_ref.referrer_user_id and rewarded_at is not null;
  if v_count%5=0 then
    insert into credit_ledger(user_id,amount,reason,order_id,sku) values(v_ref.referrer_user_id,1,'bonus_indicacoes',p_order_id,'milestone_'||v_count::text);
  end if;
  return jsonb_build_object('awarded',true,'bonus',v_count%5=0);
end $$;

create or replace function approve_credit_purchase(p_txid text,p_paid_amount numeric)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_purchase credit_purchases%rowtype; v_balance numeric; v_offer jsonb; begin
  select * into v_purchase from credit_purchases where txid=p_txid for update;
  if not found then return jsonb_build_object('found',false); end if;
  if p_paid_amount is null or p_paid_amount<=0 or p_paid_amount::text in ('NaN','Infinity','-Infinity')
    or abs(v_purchase.expected_amount-p_paid_amount)>=0.01 then
    return jsonb_build_object('found',true,'approved',false,'reason','valor_incorreto');
  end if;
  if v_purchase.status<>'APROVADO' then
    if v_purchase.package_sku='creditos_pos_compra_1' then
      v_offer:=customer_second_song_offer(v_purchase.user_id,v_purchase.source_order_id);
      if not coalesce((v_offer->>'eligible')::boolean,false) then return jsonb_build_object('found',true,'approved',false,'reason','requer_conciliacao'); end if;
    end if;
    perform ensure_credit_account(v_purchase.user_id);
    update credit_purchases set status='APROVADO',paid_at=now() where id=v_purchase.id;
    insert into credit_ledger(user_id,amount,reason,credit_purchase_id) values(v_purchase.user_id,v_purchase.credits,'compra',v_purchase.id) on conflict(credit_purchase_id) do nothing;
  end if;
  select coalesce(sum(amount),0) into v_balance from credit_ledger where user_id=v_purchase.user_id;
  return jsonb_build_object('found',true,'approved',true,'balance',v_balance);
end $$;

create or replace function record_order_payment_intent(p_order_id text,p_txid text,p_sku text,p_amount numeric)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_order orders%rowtype; v_previous jsonb; v_extras jsonb; begin
  select * into v_order from orders where id=p_order_id and deleted_at is null for update;
  if not found then return false; end if;
  v_extras:=coalesce(v_order.extras,'{}'::jsonb);
  v_previous:=coalesce(v_extras->'previousPaymentIntentIds','[]'::jsonb);
  if nullif(v_extras->>'paymentIntentId','') is not null and v_extras->>'paymentIntentId'<>p_txid
    and not v_previous @> jsonb_build_array(v_extras->>'paymentIntentId') then
    v_previous:=v_previous||jsonb_build_array(v_extras->>'paymentIntentId');
  end if;
  update orders set extras=v_extras||jsonb_build_object('paymentIntentId',p_txid,'paymentIntentSku',p_sku,'expectedAmount',p_amount,
    'paymentIntentSkuByTxid',coalesce(v_extras->'paymentIntentSkuByTxid','{}'::jsonb)||jsonb_build_object(p_txid,p_sku),
    'paymentIntentAmountByTxid',coalesce(v_extras->'paymentIntentAmountByTxid','{}'::jsonb)||jsonb_build_object(p_txid,p_amount),
    'previousPaymentIntentIds',v_previous),updated_at=now() where id=p_order_id;
  return true;
end $$;

create or replace function redeem_credits_for_order(p_user_id uuid,p_order_id text,p_sku text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_cost numeric; v_balance numeric; v_order orders%rowtype; v_music boolean; v_video boolean; v_carta boolean; v_retro boolean; v_voice boolean; begin
  v_cost:=case p_sku when 'audio_only' then 1 when 'video_addon' then 1 when 'carta_addon' then 0.5
    when 'retrospectiva_addon' then 1 when 'playback_addon' then 1 when 'karaoke_addon' then 1 when 'custom_voice_addon' then 1
    when 'combo_carta' then 1.5 when 'combo' then 2.5 when 'combo_retrospectiva' then 3.5 when 'combo_voz' then 2 else null end;
  if v_cost is null then return jsonb_build_object('ok',false,'reason','sku_invalido'); end if;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select * into v_order from orders where id=p_order_id and user_id=p_user_id::text and deleted_at is null for update;
  if not found then return jsonb_build_object('ok',false,'reason','pedido_nao_pertence_a_conta'); end if;
  v_music:=p_sku in ('audio_only','combo_carta','combo','combo_retrospectiva','combo_voz');
  v_video:=p_sku in ('video_addon','combo','combo_retrospectiva');
  v_carta:=p_sku in ('carta_addon','combo_carta','combo','combo_retrospectiva');
  v_retro:=p_sku in ('retrospectiva_addon','combo_retrospectiva');
  v_voice:=p_sku in ('custom_voice_addon','combo_voz');
  if (v_music and v_order.payment_status in ('PAGO','PAGAMENTO_APROVADO'))
    or (p_sku='video_addon' and v_order.has_video_access)
    or (p_sku='carta_addon' and v_order.has_carta_access)
    or (p_sku='retrospectiva_addon' and v_order.has_retrospectiva_access)
    or (p_sku='playback_addon' and v_order.has_playback_access)
    or (p_sku='karaoke_addon' and coalesce(v_order.extras->>'hasKaraokeAccess','false')='true')
    or (p_sku='custom_voice_addon' and coalesce(v_order.extras->>'hasCustomVoiceAccess','false')='true')
    then return jsonb_build_object('ok',false,'reason','produto_ja_liberado'); end if;
  select coalesce(sum(amount),0) into v_balance from credit_ledger where user_id=p_user_id;
  if v_balance<v_cost then return jsonb_build_object('ok',false,'reason','saldo_insuficiente','balance',v_balance); end if;
  insert into credit_ledger(user_id,amount,reason,sku,order_id) values(p_user_id,-v_cost,'resgate',p_sku,p_order_id);
  update orders set payment_status=case when v_music then 'PAGAMENTO_APROVADO' else payment_status end,
    paid_at=case when v_music then coalesce(paid_at,now()) else paid_at end,
    has_video_access=coalesce(has_video_access,false) or v_video,
    has_carta_access=coalesce(has_carta_access,false) or v_carta,
    has_retrospectiva_access=coalesce(has_retrospectiva_access,false) or v_retro,
    has_playback_access=coalesce(has_playback_access,false) or p_sku='playback_addon',
    has_karaoke_access=coalesce(has_karaoke_access,false) or p_sku='karaoke_addon',
    extras=coalesce(extras,'{}'::jsonb)||jsonb_build_object(
      'creditRedeemedAt',now()::text,'hasKaraokeAccess',p_sku='karaoke_addon' or coalesce(extras->>'hasKaraokeAccess','false')='true',
      'karaokeAddonPaid',p_sku='karaoke_addon' or coalesce(extras->>'karaokeAddonPaid','false')='true',
      'hasCustomVoiceAccess',v_voice or coalesce(extras->>'hasCustomVoiceAccess','false')='true',
      'customVoiceAddonPaid',v_voice or coalesce(extras->>'customVoiceAddonPaid','false')='true'),updated_at=now() where id=p_order_id;
  return jsonb_build_object('ok',true,'cost',v_cost,'balance',v_balance-v_cost);
end $$;

create table if not exists order_claim_codes (
  id uuid primary key,order_id text not null references orders(id),user_id uuid not null references auth.users(id),
  phone_hash text not null,code_hash text not null,attempts integer not null default 0,
  expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists order_claim_code_rate on order_claim_codes(phone_hash,created_at desc);
alter table order_claim_codes enable row level security;

create or replace function reserve_order_claim_code(p_id uuid,p_user_id uuid,p_order_id text,p_phone_hash text,p_code_hash text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  perform pg_advisory_xact_lock(hashtext('claim-phone:'||p_phone_hash));
  if not exists(select 1 from orders where id=p_order_id and deleted_at is null and (user_id is null or user_id=p_user_id::text)) then return false; end if;
  if (select count(*) from order_claim_codes where phone_hash=p_phone_hash and created_at>now()-interval '1 hour')>=3
    or (select count(*) from order_claim_codes where user_id=p_user_id and created_at>now()-interval '1 hour')>=6
    or exists(select 1 from order_claim_codes where phone_hash=p_phone_hash and created_at>now()-interval '60 seconds') then return false; end if;
  update order_claim_codes set consumed_at=now() where order_id=p_order_id and user_id=p_user_id and consumed_at is null;
  insert into order_claim_codes(id,order_id,user_id,phone_hash,code_hash,expires_at) values(p_id,p_order_id,p_user_id,p_phone_hash,p_code_hash,now()+interval '5 minutes');
  return true;
end $$;

create or replace function verify_order_claim_code(p_id uuid,p_user_id uuid,p_code_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_code order_claim_codes%rowtype; v_order orders%rowtype; v_hash text; begin
  select * into v_code from order_claim_codes where id=p_id and user_id=p_user_id for update;
  if not found or v_code.consumed_at is not null or v_code.expires_at<=now() or v_code.attempts>=5 then return jsonb_build_object('claimed',false); end if;
  update order_claim_codes set attempts=attempts+1 where id=p_id;
  if p_code_hash is null or v_code.code_hash<>p_code_hash then return jsonb_build_object('claimed',false); end if;
  select * into v_order from orders where id=v_code.order_id and deleted_at is null for update;
  if not found or (v_order.user_id is not null and v_order.user_id<>p_user_id::text) then return jsonb_build_object('claimed',false); end if;
  update order_claim_codes set consumed_at=now() where id=p_id;
  -- gen_random_uuid is already used by the installed schema; no pgcrypto dependency.
  v_hash:=coalesce(nullif(v_order.extras->>'ownerClaimHash',''),replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
  update orders set extras=coalesce(extras,'{}'::jsonb)||jsonb_build_object('ownerClaimHash',v_hash) where id=v_order.id;
  return claim_order_for_customer(p_user_id,v_order.id,v_hash)||jsonb_build_object('orderId',v_order.id);
end $$;

create or replace function reconcile_pending_referrals(p_limit integer default 50)
returns integer language plpgsql security definer set search_path=public as $$
declare v_item record; v_result jsonb; v_count integer:=0; begin
  for v_item in
    select r.referee_user_id,o.id from referrals r join lateral (
      select candidate.id from orders candidate where candidate.user_id=r.referee_user_id::text and candidate.deleted_at is null
        and candidate.payment_status in ('PAGO','PAGAMENTO_APROVADO') and exists(
          select 1 from payments p where p.order_id=candidate.id and p.kind='musica' and p.amount>0)
      order by candidate.paid_at asc nulls last limit 1
    ) o on true where r.rewarded_at is null order by r.created_at limit greatest(1,least(p_limit,100))
  loop
    v_result:=reward_referral_for_order(v_item.id,v_item.referee_user_id);
    if coalesce((v_result->>'awarded')::boolean,false) then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;

-- These security-definer functions are server-only. RLS does not protect RPC execution.
revoke all on function ensure_credit_account(uuid) from public,anon,authenticated;
revoke all on function approve_credit_purchase(text,numeric) from public,anon,authenticated;
revoke all on function reward_referral_for_order(text,uuid) from public,anon,authenticated;
revoke all on function redeem_credits_for_order(uuid,text,text) from public,anon,authenticated;
revoke all on function customer_credit_summary(uuid) from public,anon,authenticated;
revoke all on function attach_referral_to_customer(uuid,text) from public,anon,authenticated;
revoke all on function claim_order_for_customer(uuid,text,text) from public,anon,authenticated;
revoke all on function customer_second_song_offer(uuid,text) from public,anon,authenticated;
revoke all on function reserve_credit_purchase(uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function reserve_order_payment(text,text,numeric,text) from public,anon,authenticated;
revoke all on function record_order_payment_intent(text,text,text,numeric) from public,anon,authenticated;
revoke all on function reserve_order_claim_code(uuid,uuid,text,text,text) from public,anon,authenticated;
revoke all on function verify_order_claim_code(uuid,uuid,text) from public,anon,authenticated;
revoke all on function reconcile_pending_referrals(integer) from public,anon,authenticated;
grant execute on function ensure_credit_account(uuid),approve_credit_purchase(text,numeric),reward_referral_for_order(text,uuid),
  redeem_credits_for_order(uuid,text,text),customer_credit_summary(uuid),attach_referral_to_customer(uuid,text),
  claim_order_for_customer(uuid,text,text),customer_second_song_offer(uuid,text),reserve_credit_purchase(uuid,text,text,text,text),
  reserve_order_payment(text,text,numeric,text),record_order_payment_intent(text,text,text,numeric),
  reserve_order_claim_code(uuid,uuid,text,text,text),verify_order_claim_code(uuid,uuid,text),reconcile_pending_referrals(integer) to service_role;

commit;
