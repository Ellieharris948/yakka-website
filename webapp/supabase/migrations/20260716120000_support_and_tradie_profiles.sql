-- Support tickets, richer tradie profiles, and team invite completion.

create extension if not exists pgcrypto;

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  payout_provider text not null default 'stripe',
  payout_status text not null default 'not_started',
  verification_status text not null default 'pending',
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
  updated_at timestamptz not null default now()
);

create unique index if not exists team_members_team_email_key
  on public.team_members(team_account_id, email);
create unique index if not exists team_members_team_user_key
  on public.team_members(team_account_id, user_id) where user_id is not null;

alter table public.team_accounts enable row level security;
alter table public.team_members enable row level security;

-- Keep policy checks out of the two tables' RLS evaluation to avoid recursive
-- team_accounts -> team_members -> team_accounts policy evaluation.
create or replace function public.is_team_account_owner(p_team_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_accounts ta
    where ta.id = p_team_account_id
      and ta.owner_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_team_account_member(p_team_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.team_account_id = p_team_account_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
  );
$$;

revoke all on function public.is_team_account_owner(uuid) from public;
revoke all on function public.is_active_team_account_member(uuid) from public;
grant execute on function public.is_team_account_owner(uuid) to authenticated;
grant execute on function public.is_active_team_account_member(uuid) to authenticated;

drop policy if exists "team_accounts_select" on public.team_accounts;
create policy "team_accounts_select" on public.team_accounts
for select to authenticated
using (
  owner_user_id = auth.uid()
  or public.is_active_team_account_member(id)
);

drop policy if exists "team_accounts_insert" on public.team_accounts;
create policy "team_accounts_insert" on public.team_accounts
for insert to authenticated with check (owner_user_id = auth.uid());

drop policy if exists "team_accounts_update" on public.team_accounts;
create policy "team_accounts_update" on public.team_accounts
for update to authenticated using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists "team_accounts_delete" on public.team_accounts;
create policy "team_accounts_delete" on public.team_accounts
for delete to authenticated using (owner_user_id = auth.uid());

drop policy if exists "team_members_select" on public.team_members;
create policy "team_members_select" on public.team_members
for select to authenticated
using (
  user_id = auth.uid()
  or public.is_team_account_owner(team_account_id)
);

drop policy if exists "team_members_insert" on public.team_members;
create policy "team_members_insert" on public.team_members
for insert to authenticated
with check (public.is_team_account_owner(team_account_id));

drop policy if exists "team_members_update" on public.team_members;
create policy "team_members_update" on public.team_members
for update to authenticated
using (public.is_team_account_owner(team_account_id))
with check (public.is_team_account_owner(team_account_id));

alter table public.profiles
  add column if not exists trader_mode text null check (trader_mode in ('solo', 'team')),
  add column if not exists qualifications text[] not null default '{}',
  add column if not exists business_accreditations text[] not null default '{}',
  add column if not exists public_liability_insurance text null;

alter table public.team_accounts
  add column if not exists accreditation_document_path text null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-documents',
  'profile-documents',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_documents_insert_own" on storage.objects;
create policy "profile_documents_insert_own"
on storage.objects for insert to authenticated
with check (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile_documents_select_own" on storage.objects;
create policy "profile_documents_select_own"
on storage.objects for select to authenticated
using (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "profile_documents_update_own" on storage.objects;
create policy "profile_documents_update_own"
on storage.objects for update to authenticated
using (bucket_id = 'profile-documents' and (storage.foldername(name))[1] = auth.uid()::text);

drop trigger if exists set_team_accounts_updated_at on public.team_accounts;
create trigger set_team_accounts_updated_at
before update on public.team_accounts
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists set_team_members_updated_at on public.team_members;
create trigger set_team_members_updated_at
before update on public.team_members
for each row execute function public.set_timestamp_updated_at();

create sequence if not exists public.support_request_number_seq start with 1000;

create or replace function public.next_support_request_number()
returns text
language sql
volatile
set search_path = public
as $$
  select 'YAK-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.support_request_number_seq')::text, 6, '0');
$$;

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique default public.next_support_request_number(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_role text null,
  name text null,
  email text not null,
  phone text null,
  category text not null check (category in ('get_help', 'report_bug', 'account', 'payment', 'other')),
  subject text not null,
  message text not null,
  job_id uuid null references public.jobs(id) on delete set null,
  status text not null default 'received' check (status in ('received', 'in_progress', 'resolved', 'closed')),
  email_status text not null default 'pending' check (email_status in ('pending', 'sent', 'failed', 'not_configured')),
  email_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_created_idx
  on public.support_requests(user_id, created_at desc);

alter table public.support_requests enable row level security;

drop policy if exists "support_requests_select_own" on public.support_requests;
create policy "support_requests_select_own"
on public.support_requests
for select
to authenticated
using (user_id = auth.uid());

drop trigger if exists set_support_requests_updated_at on public.support_requests;
create trigger set_support_requests_updated_at
before update on public.support_requests
for each row
execute function public.set_timestamp_updated_at();

-- Connect pending team invites when the invitee creates their own login.
create or replace function public.link_pending_team_members_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.team_members
  set
    user_id = new.id,
    status = 'active',
    accepted_at = coalesce(accepted_at, now()),
    updated_at = now()
  where lower(email) = lower(new.email)
    and status = 'invited'
    and user_id is null;

  return new;
end;
$$;

drop trigger if exists link_pending_team_members_after_signup on auth.users;
create trigger link_pending_team_members_after_signup
after insert on auth.users
for each row
execute function public.link_pending_team_members_on_signup();

-- Also connect an invitation immediately when its email already belongs to an
-- existing YAKKA login.
create or replace function public.link_team_member_before_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matching_user_id uuid;
begin
  select id into matching_user_id
  from auth.users
  where lower(email) = lower(new.email)
  limit 1;

  if matching_user_id is not null then
    new.user_id := matching_user_id;
    new.status := 'active';
    new.accepted_at := coalesce(new.accepted_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists link_team_member_before_invite on public.team_members;
create trigger link_team_member_before_invite
before insert or update of email on public.team_members
for each row
execute function public.link_team_member_before_invite();
