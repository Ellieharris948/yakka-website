-- Store only Stripe's connected-account reference and verification state.
-- Raw bank details are collected and retained by Stripe's hosted onboarding.

create table if not exists public.stripe_connect_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_account_id text not null unique,
  details_submitted boolean not null default false,
  payouts_enabled boolean not null default false,
  charges_enabled boolean not null default false,
  disabled_reason text null,
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stripe_connect_accounts enable row level security;

drop policy if exists "stripe_connect_accounts_select_own" on public.stripe_connect_accounts;
create policy "stripe_connect_accounts_select_own"
on public.stripe_connect_accounts
for select
to authenticated
using (user_id = auth.uid());

-- Preserve any connected account references created by the previous
-- bank_accounts implementation, without copying account numbers or sort codes.
do $$
begin
  if to_regclass('public.bank_accounts') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'bank_accounts'
         and column_name = 'stripe_connected_account_id'
     ) then
    execute $migration$
      insert into public.stripe_connect_accounts (user_id, stripe_account_id)
      select distinct on (user_id)
        user_id,
        stripe_connected_account_id
      from public.bank_accounts
      where nullif(trim(stripe_connected_account_id), '') is not null
      order by user_id, created_at desc
      on conflict (user_id) do nothing
    $migration$;
  end if;
end
$$;

create index if not exists stripe_connect_accounts_account_idx
  on public.stripe_connect_accounts(stripe_account_id);
