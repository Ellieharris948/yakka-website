-- Yakka team/company account setup
-- Run this whole file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.team_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  team_mode text not null default 'team' check (team_mode in ('solo', 'team')),
  business_name text null,
  trading_name text null,
  company_registration_number text null,
  work_address text null,
  postcode text null,
  payout_provider text not null default 'stripe' check (payout_provider in ('stripe')),
  payout_status text not null default 'not_started' check (payout_status in ('not_started', 'pending', 'ready', 'restricted')),
  verification_status text not null default 'pending' check (verification_status in ('pending', 'reviewing', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_account_id uuid not null references public.team_accounts(id) on delete cascade,
  user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  role text not null default 'team_member' check (role in ('account_owner', 'team_member')),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  invited_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_email_lower check (email = lower(email))
);

create unique index if not exists team_members_team_email_key
  on public.team_members(team_account_id, email);

create unique index if not exists team_members_team_user_key
  on public.team_members(team_account_id, user_id)
  where user_id is not null;

create index if not exists team_members_user_id_idx
  on public.team_members(user_id);

create index if not exists team_members_team_account_id_idx
  on public.team_members(team_account_id);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_team_accounts_updated_at on public.team_accounts;
create trigger set_team_accounts_updated_at
before update on public.team_accounts
for each row
execute function public.set_timestamp_updated_at();

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row
execute function public.set_timestamp_updated_at();

alter table public.team_accounts enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "team_accounts_select" on public.team_accounts;
create policy "team_accounts_select"
on public.team_accounts
for select
to authenticated
using (
  owner_user_id = auth.uid()
  or exists (
    select 1
    from public.team_members tm
    where tm.team_account_id = team_accounts.id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  )
);

drop policy if exists "team_accounts_insert" on public.team_accounts;
create policy "team_accounts_insert"
on public.team_accounts
for insert
to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists "team_accounts_update" on public.team_accounts;
create policy "team_accounts_update"
on public.team_accounts
for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select"
on public.team_members
for select
to authenticated
using (
  exists (
    select 1
    from public.team_accounts ta
    where ta.id = team_members.team_account_id
      and ta.owner_user_id = auth.uid()
  )
  or user_id = auth.uid()
);

drop policy if exists "team_members_insert" on public.team_members;
create policy "team_members_insert"
on public.team_members
for insert
to authenticated
with check (
  exists (
    select 1
    from public.team_accounts ta
    where ta.id = team_members.team_account_id
      and ta.owner_user_id = auth.uid()
  )
);

drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update"
on public.team_members
for update
to authenticated
using (
  exists (
    select 1
    from public.team_accounts ta
    where ta.id = team_members.team_account_id
      and ta.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.team_accounts ta
    where ta.id = team_members.team_account_id
      and ta.owner_user_id = auth.uid()
  )
);

insert into public.team_accounts (
  owner_user_id,
  name,
  team_mode,
  business_name,
  trading_name,
  company_registration_number,
  work_address,
  postcode,
  payout_provider,
  payout_status,
  verification_status
)
select
  p.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'business_name', ''),
    nullif(u.raw_user_meta_data ->> 'trading_name', ''),
    nullif(p.name, ''),
    'Yakka Team'
  ) as name,
  case
    when coalesce(u.raw_user_meta_data ->> 'trader_mode', 'solo') = 'team' then 'team'
    else 'solo'
  end as team_mode,
  nullif(u.raw_user_meta_data ->> 'business_name', ''),
  nullif(u.raw_user_meta_data ->> 'trading_name', ''),
  nullif(u.raw_user_meta_data ->> 'company_registration_number', ''),
  nullif(u.raw_user_meta_data ->> 'work_address', ''),
  nullif(u.raw_user_meta_data ->> 'postcode', ''),
  'stripe',
  'not_started',
  'pending'
from public.profiles p
join auth.users u
  on u.id = p.id
where p.role = 'trader'
  and coalesce(u.raw_user_meta_data ->> 'trader_mode', 'solo') = 'team'
on conflict (owner_user_id) do update
set
  name = excluded.name,
  business_name = excluded.business_name,
  trading_name = excluded.trading_name,
  company_registration_number = excluded.company_registration_number,
  work_address = excluded.work_address,
  postcode = excluded.postcode,
  team_mode = excluded.team_mode,
  updated_at = now();

insert into public.team_members (
  team_account_id,
  user_id,
  email,
  role,
  status,
  invited_by,
  accepted_at
)
select
  ta.id,
  ta.owner_user_id,
  lower(p.email),
  'account_owner',
  'active',
  ta.owner_user_id,
  now()
from public.team_accounts ta
join public.profiles p
  on p.id = ta.owner_user_id
on conflict (team_account_id, email) do update
set
  user_id = excluded.user_id,
  role = 'account_owner',
  status = 'active',
  accepted_at = coalesce(team_members.accepted_at, excluded.accepted_at),
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'team_invites'
  ) then
    insert into public.team_members (
      team_account_id,
      email,
      role,
      status,
      invited_by,
      created_at
    )
    select
      ta.id,
      lower(ti.email),
      'team_member',
      case
        when ti.status = 'accepted' then 'active'
        when ti.status = 'revoked' then 'revoked'
        else 'invited'
      end,
      ti.owner_id,
      ti.created_at
    from public.team_invites ti
    join public.team_accounts ta
      on ta.owner_user_id = ti.owner_id
    on conflict (team_account_id, email) do update
    set
      status = excluded.status,
      invited_by = excluded.invited_by,
      updated_at = now();
  end if;
end $$;
