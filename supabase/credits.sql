-- Carteira de créditos e indicação. Rodar uma vez no SQL Editor do Supabase.
-- Todo saldo é derivado do livro-razão; créditos nunca expiram.

create table if not exists credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  referral_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists credit_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_sku text not null check (package_sku in ('creditos_1', 'creditos_5', 'creditos_10')),
  credits numeric(10,1) not null check (credits > 0),
  expected_amount numeric(10,2) not null check (expected_amount > 0),
  txid text not null unique,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'APROVADO')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(10,1) not null check (amount <> 0),
  reason text not null check (reason in ('compra', 'indicacao', 'bonus_indicacoes', 'resgate')),
  sku text,
  credit_purchase_id uuid unique references credit_purchases(id),
  order_id text references orders(id),
  created_at timestamptz not null default now(),
  unique (user_id, order_id, reason, sku)
);

create table if not exists referrals (
  referee_user_id uuid primary key references auth.users(id) on delete cascade,
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  qualifying_order_id text unique references orders(id),
  rewarded_at timestamptz,
  created_at timestamptz not null default now(),
  check (referee_user_id <> referrer_user_id)
);

create index if not exists credit_ledger_user_idx on credit_ledger(user_id, created_at desc);
create index if not exists referrals_referrer_idx on referrals(referrer_user_id, rewarded_at);

alter table credit_accounts enable row level security;
alter table credit_purchases enable row level security;
alter table credit_ledger enable row level security;
alter table referrals enable row level security;

create or replace function ensure_credit_account(p_user_id uuid)
returns credit_accounts language plpgsql security definer set search_path = public as $$
declare v_account credit_accounts%rowtype; begin
  select * into v_account from credit_accounts where user_id = p_user_id;
  if found then return v_account; end if;
  loop
    begin
      insert into credit_accounts(user_id, referral_code)
      values (p_user_id, lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
      returning * into v_account;
      return v_account;
    exception when unique_violation then
      -- Pode ser colisão extremamente improvável do código; tenta outro sem falhar a conta.
    end;
  end loop;
end $$;

-- Único ponto de entrada de compra: bloqueia a linha e só lança uma vez por txid.
create or replace function approve_credit_purchase(p_txid text, p_paid_amount numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_purchase credit_purchases%rowtype; v_balance numeric(10,1); begin
  select * into v_purchase from credit_purchases where txid = p_txid for update;
  if not found then return jsonb_build_object('found', false); end if;
  if abs(v_purchase.expected_amount - p_paid_amount) >= 0.01 then
    return jsonb_build_object('found', true, 'approved', false, 'reason', 'valor_incorreto');
  end if;
  insert into credit_accounts(user_id, referral_code) values (v_purchase.user_id, lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))) on conflict (user_id) do nothing;
  if v_purchase.status <> 'APROVADO' then
    update credit_purchases set status = 'APROVADO', paid_at = now() where id = v_purchase.id;
    insert into credit_ledger(user_id, amount, reason, credit_purchase_id) values (v_purchase.user_id, v_purchase.credits, 'compra', v_purchase.id) on conflict (credit_purchase_id) do nothing;
  end if;
  select coalesce(sum(amount), 0) into v_balance from credit_ledger where user_id = v_purchase.user_id;
  return jsonb_build_object('found', true, 'approved', true, 'balance', v_balance);
end $$;

-- Indicação só entra depois do pagamento confirmado do primeiro pedido da pessoa indicada.
create or replace function reward_referral_for_order(p_order_id text, p_referee_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ref referrals%rowtype; v_count integer; begin
  select * into v_ref from referrals where referee_user_id = p_referee_user_id for update;
  if not found or v_ref.rewarded_at is not null then return jsonb_build_object('awarded', false); end if;
  update referrals set qualifying_order_id = p_order_id, rewarded_at = now() where referee_user_id = p_referee_user_id;
  insert into credit_accounts(user_id, referral_code) values (v_ref.referrer_user_id, lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))) on conflict (user_id) do nothing;
  insert into credit_ledger(user_id, amount, reason, order_id) values (v_ref.referrer_user_id, 1, 'indicacao', p_order_id);
  select count(*) into v_count from referrals where referrer_user_id = v_ref.referrer_user_id and rewarded_at is not null;
  if v_count % 5 = 0 then
    insert into credit_ledger(user_id, amount, reason, order_id) values (v_ref.referrer_user_id, 1, 'bonus_indicacoes', p_order_id);
  end if;
  return jsonb_build_object('awarded', true, 'bonus', v_count % 5 = 0);
end $$;

-- Débito e liberação no mesmo commit: duas abas não conseguem gastar o mesmo saldo.
create or replace function redeem_credits_for_order(p_user_id uuid, p_order_id text, p_sku text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_cost numeric(10,1); v_balance numeric(10,1); v_order orders%rowtype; begin
  if p_sku not in ('audio_only', 'video_addon', 'carta_addon', 'retrospectiva_addon', 'playback_addon', 'karaoke_addon', 'custom_voice_addon') then
    return jsonb_build_object('ok', false, 'reason', 'sku_invalido');
  end if;
  v_cost := case when p_sku = 'carta_addon' then 0.5 else 1 end;
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select * into v_order from orders where id = p_order_id and user_id = p_user_id::text and deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'pedido_nao_pertence_a_conta'); end if;
  if (p_sku = 'audio_only' and v_order.payment_status in ('PAGAMENTO_APROVADO', 'PAGO'))
     or (p_sku = 'video_addon' and v_order.has_video_access)
     or (p_sku = 'carta_addon' and v_order.has_carta_access)
     or (p_sku = 'retrospectiva_addon' and v_order.has_retrospectiva_access)
     or (p_sku = 'playback_addon' and v_order.has_playback_access)
     or (p_sku = 'karaoke_addon' and coalesce(v_order.extras ->> 'hasKaraokeAccess', 'false') = 'true')
     or (p_sku = 'custom_voice_addon' and coalesce(v_order.extras ->> 'hasCustomVoiceAccess', 'false') = 'true') then
    return jsonb_build_object('ok', false, 'reason', 'produto_ja_liberado');
  end if;
  select coalesce(sum(amount), 0) into v_balance from credit_ledger where user_id = p_user_id;
  if v_balance < v_cost then return jsonb_build_object('ok', false, 'reason', 'saldo_insuficiente', 'balance', v_balance); end if;
  insert into credit_ledger(user_id, amount, reason, sku, order_id) values (p_user_id, -v_cost, 'resgate', p_sku, p_order_id);
  update orders set
    payment_status = case when p_sku = 'audio_only' then 'PAGAMENTO_APROVADO' else payment_status end,
    paid_at = case when p_sku = 'audio_only' then coalesce(paid_at, now()) else paid_at end,
    has_video_access = has_video_access or p_sku = 'video_addon',
    has_carta_access = has_carta_access or p_sku = 'carta_addon',
    has_retrospectiva_access = has_retrospectiva_access or p_sku = 'retrospectiva_addon',
    has_playback_access = has_playback_access or p_sku = 'playback_addon',
    extras = extras || jsonb_build_object(
      'creditRedeemedAt', now()::text,
      'karaokeAddonPaid', p_sku = 'karaoke_addon' or coalesce((extras ->> 'karaokeAddonPaid')::boolean, false),
      'hasKaraokeAccess', p_sku = 'karaoke_addon' or coalesce((extras ->> 'hasKaraokeAccess')::boolean, false),
      'customVoiceAddonPaid', p_sku = 'custom_voice_addon' or coalesce((extras ->> 'customVoiceAddonPaid')::boolean, false),
      'hasCustomVoiceAccess', p_sku = 'custom_voice_addon' or coalesce((extras ->> 'hasCustomVoiceAccess')::boolean, false)
    ), updated_at = now()
  where id = p_order_id;
  return jsonb_build_object('ok', true, 'cost', v_cost, 'balance', v_balance - v_cost);
end $$;
