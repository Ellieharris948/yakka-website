-- Add a first-party ledger, auditable dispute settlements, webhook claiming,
-- and reconciliation records for the Stripe separate-charges-and-transfers flow.

alter table public.payments
  add column if not exists tradie_id uuid references auth.users(id),
  add column if not exists received_at timestamptz,
  add column if not exists held_since timestamptz,
  add column if not exists released_at timestamptz,
  add column if not exists disputed_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists customer_refund_requested_cents integer not null default 0,
  add column if not exists customer_refunded_cents integer not null default 0,
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_refund_status text,
  add column if not exists stripe_checkout_idempotency_key text,
  add column if not exists last_reconciled_at timestamptz;

update public.payments payment
set tradie_id = job.trader_id
from public.jobs job
where job.id = payment.job_id
  and payment.tradie_id is null
  and job.trader_id is not null;

do $$
declare
  payment_status_type regtype;
begin
  select attribute.atttypid::regtype
  into payment_status_type
  from pg_attribute attribute
  join pg_type type on type.oid = attribute.atttypid
  where attribute.attrelid = 'public.payments'::regclass
    and attribute.attname = 'status'
    and not attribute.attisdropped
    and type.typtype = 'e';

  if payment_status_type is not null then
    execute format('alter type %s add value if not exists %L', payment_status_type, 'disputed');
    execute format('alter type %s add value if not exists %L', payment_status_type, 'partially_refunded');
    execute format('alter type %s add value if not exists %L', payment_status_type, 'refund_pending');
  end if;
end
$$;

alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check check (
  status::text = any (array[
    'awaiting_funding', 'funded', 'released', 'disputed',
    'partially_refunded', 'refunded', 'refund_pending', 'failed', 'cancelled'
  ]::text[])
) not valid;

create unique index if not exists payments_checkout_idempotency_key
  on public.payments(stripe_checkout_idempotency_key)
  where stripe_checkout_idempotency_key is not null;

create or replace function public.rpc_prepare_stripe_payment(
  p_job_id uuid,
  p_client_id uuid,
  p_tradie_id uuid,
  p_total_cents integer,
  p_principal_cents integer,
  p_client_fee_cents integer,
  p_seller_fee_cents integer,
  p_net_to_seller_cents integer,
  p_currency text
)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result public.payments;
begin
  perform 1 from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found.'; end if;

  select * into result
  from public.payments
  where job_id = p_job_id
  order by created_at desc
  limit 1
  for update;

  if found and result.status::text in (
    'awaiting_funding', 'funded', 'released', 'disputed', 'refund_pending', 'partially_refunded', 'refunded'
  ) then
    return result;
  end if;

  insert into public.payments (
    job_id, client_id, tradie_id, total_cents, principal_cents,
    client_fee_cents, seller_fee_cents, net_to_seller_cents,
    currency, status, payment_method, provider, provider_status
  ) values (
    p_job_id, p_client_id, p_tradie_id, p_total_cents, p_principal_cents,
    p_client_fee_cents, p_seller_fee_cents, p_net_to_seller_cents,
    upper(p_currency), 'awaiting_funding', 'stripe_pay_by_bank', 'stripe', 'checkout_created'
  ) returning * into result;

  return result;
end;
$$;

revoke all on function public.rpc_prepare_stripe_payment(uuid, uuid, uuid, integer, integer, integer, integer, integer, text)
from public, anon, authenticated;
grant execute on function public.rpc_prepare_stripe_payment(uuid, uuid, uuid, integer, integer, integer, integer, integer, text)
to service_role;

create table if not exists public.payment_ledgers (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  tradie_id uuid not null references auth.users(id),
  status text not null check (status in ('held', 'released', 'disputed', 'refund_pending', 'refunded', 'resolved')),
  gross_received_cents integer not null check (gross_received_cents >= 0),
  customer_fee_cents integer not null default 0 check (customer_fee_cents >= 0),
  held_cents integer not null default 0 check (held_cents >= 0),
  transferred_cents integer not null default 0 check (transferred_cents >= 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0),
  commission_cents integer not null default 0 check (commission_cents >= 0),
  received_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_ledger_portions (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.payment_ledgers(id) on delete cascade,
  portion_key text not null,
  partial_request_id uuid references public.partial_payment_requests(id) on delete set null,
  dispute_id uuid references public.disputes(id) on delete set null,
  status text not null check (status in ('held', 'released', 'disputed', 'refund_pending', 'refunded')),
  gross_cents integer not null check (gross_cents >= 0),
  transfer_cents integer not null default 0 check (transfer_cents >= 0),
  refund_cents integer not null default 0 check (refund_cents >= 0),
  commission_cents integer not null default 0 check (commission_cents >= 0),
  held_since timestamptz not null,
  resolved_at timestamptz,
  stripe_transfer_id text,
  stripe_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, portion_key)
);

create index if not exists payment_ledger_portions_open_age_idx
  on public.payment_ledger_portions(held_since)
  where status in ('held', 'disputed');

create or replace function public.sync_partial_payment_ledger_portion()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  ledger_row public.payment_ledgers;
  payment_row public.payments;
  allocated_gross integer := 0;
  released_gross integer := 0;
  released_transfer integer := 0;
  held_status text;
begin
  select payment.* into payment_row
  from public.payments payment
  where payment.job_id = new.job_id
  order by payment.created_at desc
  limit 1;
  if not found then return new; end if;

  select * into ledger_row
  from public.payment_ledgers
  where payment_id = payment_row.id;
  if not found then return new; end if;

  if new.status::text in ('requested', 'approved') then
    insert into public.payment_ledger_portions (
      ledger_id, portion_key, partial_request_id, status, gross_cents,
      held_since, updated_at
    ) values (
      ledger_row.id, 'partial:' || new.id::text, new.id, 'held',
      greatest(0, coalesce(new.amount_cents, 0)), ledger_row.received_at, now()
    ) on conflict (ledger_id, portion_key) do update set
      status = excluded.status,
      gross_cents = excluded.gross_cents,
      resolved_at = null,
      updated_at = now();
  elsif new.status::text = 'released' then
    insert into public.payment_ledger_portions (
      ledger_id, portion_key, partial_request_id, status, gross_cents,
      transfer_cents, commission_cents, held_since, resolved_at,
      stripe_transfer_id, updated_at
    ) values (
      ledger_row.id, 'partial:' || new.id::text, new.id, 'released',
      greatest(0, coalesce(new.amount_cents, 0)),
      greatest(0, coalesce(new.released_amount_cents, 0)),
      greatest(0, coalesce(new.amount_cents, 0) - coalesce(new.released_amount_cents, 0)),
      ledger_row.received_at, coalesce(new.released_at, now()), new.stripe_transfer_id, now()
    ) on conflict (ledger_id, portion_key) do update set
      status = excluded.status,
      gross_cents = excluded.gross_cents,
      transfer_cents = excluded.transfer_cents,
      commission_cents = excluded.commission_cents,
      resolved_at = excluded.resolved_at,
      stripe_transfer_id = excluded.stripe_transfer_id,
      updated_at = now();
  else
    delete from public.payment_ledger_portions
    where ledger_id = ledger_row.id
      and portion_key = 'partial:' || new.id::text
      and status = 'held';
  end if;

  select
    coalesce(sum(amount_cents) filter (where status::text in ('requested', 'approved', 'released')), 0)::integer,
    coalesce(sum(amount_cents) filter (where status::text = 'released'), 0)::integer,
    coalesce(sum(released_amount_cents) filter (where status::text = 'released'), 0)::integer
  into allocated_gross, released_gross, released_transfer
  from public.partial_payment_requests
  where job_id = new.job_id;

  held_status := case when ledger_row.status = 'disputed' then 'disputed' else 'held' end;
  update public.payment_ledger_portions
  set gross_cents = greatest(0, payment_row.principal_cents - allocated_gross),
      status = held_status,
      updated_at = now()
  where ledger_id = ledger_row.id and portion_key = 'job-balance';

  update public.payment_ledgers
  set held_cents = greatest(0, payment_row.principal_cents - released_gross),
      transferred_cents = released_transfer,
      commission_cents = greatest(0, released_gross - released_transfer),
      updated_at = now()
  where id = ledger_row.id;

  return new;
end;
$$;

drop trigger if exists sync_partial_payment_ledger_portion on public.partial_payment_requests;
create trigger sync_partial_payment_ledger_portion
after insert or update of status, amount_cents, released_amount_cents, stripe_transfer_id
on public.partial_payment_requests
for each row execute function public.sync_partial_payment_ledger_portion();

create table if not exists public.payment_operations (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  payment_id uuid references public.payments(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  operation_type text not null check (operation_type in ('checkout', 'transfer', 'refund', 'reconciliation')),
  status text not null check (status in ('pending', 'succeeded', 'failed')),
  attempt_count integer not null default 0,
  idempotency_key text,
  stripe_object_id text,
  last_error text,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  payment_id uuid references public.payments(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  severity text not null check (severity in ('warning', 'critical')),
  category text not null,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrence_count integer not null default 1,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

create table if not exists public.payment_admin_audit (
  id uuid primary key default gen_random_uuid(),
  operation_key text not null unique,
  admin_user_id uuid not null references auth.users(id),
  job_id uuid not null references public.jobs(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  dispute_id uuid references public.disputes(id) on delete set null,
  action text not null,
  reason text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  checked_count integer not null default 0,
  issue_count integer not null default 0,
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  error text
);

create table if not exists public.payment_reconciliation_issues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.payment_reconciliation_runs(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade,
  issue_type text not null,
  expected jsonb not null default '{}'::jsonb,
  actual jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.disputes
  add column if not exists resolved_by uuid references auth.users(id),
  add column if not exists resolution_reason text,
  add column if not exists customer_gross_cents integer,
  add column if not exists customer_refund_cents integer,
  add column if not exists tradie_gross_cents integer,
  add column if not exists tradie_transfer_cents integer,
  add column if not exists commission_cents integer,
  add column if not exists stripe_transfer_id text,
  add column if not exists stripe_refund_id text,
  add column if not exists stripe_refund_status text,
  add column if not exists resolved_at timestamptz;

alter table public.webhook_events
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_error text;

create or replace function public.rpc_claim_stripe_webhook(
  p_event_id text,
  p_event_type text,
  p_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare claimed boolean := false;
begin
  insert into public.webhook_events(provider, event_id, event_type, payload)
  values ('stripe', p_event_id, p_event_type, p_payload)
  on conflict (provider, event_id) do update
    set payload = excluded.payload,
        event_type = excluded.event_type;

  update public.webhook_events
  set processing_started_at = now(),
      attempt_count = attempt_count + 1,
      last_error = null
  where provider = 'stripe'
    and event_id = p_event_id
    and processed_at is null
    and (
      processing_started_at is null
      or processing_started_at < now() - interval '10 minutes'
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function public.rpc_claim_stripe_webhook(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.rpc_claim_stripe_webhook(text, text, jsonb) to service_role;

create or replace view public.payment_portions_nearing_90_days
with (security_invoker = true)
as
select
  portion.id,
  ledger.payment_id,
  ledger.job_id,
  ledger.tradie_id,
  portion.portion_key,
  portion.status,
  portion.gross_cents,
  portion.held_since,
  floor(extract(epoch from (now() - portion.held_since)) / 86400)::integer as held_days
from public.payment_ledger_portions portion
join public.payment_ledgers ledger on ledger.id = portion.ledger_id
where portion.status in ('held', 'disputed')
  and portion.held_since <= now() - interval '80 days';

alter table public.payment_ledgers enable row level security;
alter table public.payment_ledger_portions enable row level security;
alter table public.payment_operations enable row level security;
alter table public.payment_alerts enable row level security;
alter table public.payment_admin_audit enable row level security;
alter table public.payment_reconciliation_runs enable row level security;
alter table public.payment_reconciliation_issues enable row level security;
alter table public.webhook_events enable row level security;

create or replace function public.is_yakka_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_yakka_admin() from public;
grant execute on function public.is_yakka_admin() to authenticated;

-- Only trusted backend/database roles may grant or remove the admin role.
-- This protects the admin-only UI and its matching database read policies even
-- if a client attempts to update profiles directly through PostgREST.
create or replace function public.protect_yakka_admin_role()
returns trigger
language plpgsql
set search_path = public, auth, pg_temp
as $$
declare
  trusted boolean := current_user in ('postgres', 'supabase_admin', 'service_role')
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
begin
  if trusted then return new; end if;
  if new.role::text = 'admin'
     or (tg_op = 'UPDATE' and old.role::text = 'admin' and new.role is distinct from old.role) then
    raise exception 'Only the YAKKA backend can manage admin access.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_yakka_admin_role on public.profiles;
create trigger protect_yakka_admin_role
before insert or update of role on public.profiles
for each row execute function public.protect_yakka_admin_role();

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.job_items enable row level security;
alter table public.payments enable row level security;
alter table public.partial_payment_requests enable row level security;
alter table public.disputes enable row level security;
alter table public.dispute_items enable row level security;
alter table public.job_photos enable row level security;
alter table public.messages enable row level security;

drop policy if exists yakka_admin_read_profiles on public.profiles;
create policy yakka_admin_read_profiles on public.profiles
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_jobs on public.jobs;
create policy yakka_admin_read_jobs on public.jobs
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_job_items on public.job_items;
create policy yakka_admin_read_job_items on public.job_items
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_payments on public.payments;
create policy yakka_admin_read_payments on public.payments
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_partial_payments on public.partial_payment_requests;
create policy yakka_admin_read_partial_payments on public.partial_payment_requests
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_disputes on public.disputes;
create policy yakka_admin_read_disputes on public.disputes
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_dispute_items on public.dispute_items;
create policy yakka_admin_read_dispute_items on public.dispute_items
for select to authenticated using (public.is_yakka_admin());

drop policy if exists yakka_admin_read_job_photos on public.job_photos;
create policy yakka_admin_read_job_photos on public.job_photos
for select to authenticated using (public.is_yakka_admin());

-- Admins can inspect chat evidence only for jobs that have entered YAKKA's
-- dispute process. Ordinary customer/tradie conversations stay private.
drop policy if exists yakka_admin_read_dispute_messages on public.messages;
create policy yakka_admin_read_dispute_messages on public.messages
for select to authenticated using (
  public.is_yakka_admin() and exists (
    select 1 from public.disputes dispute
    where dispute.job_id = messages.job_id
  )
);

drop policy if exists payment_ledgers_read_participant_or_admin on public.payment_ledgers;
create policy payment_ledgers_read_participant_or_admin on public.payment_ledgers
for select to authenticated using (
  public.is_yakka_admin() or exists (
    select 1 from public.jobs job
    where job.id = job_id and auth.uid() in (job.client_id, job.trader_id)
  )
);

drop policy if exists payment_ledger_portions_read_participant_or_admin on public.payment_ledger_portions;
create policy payment_ledger_portions_read_participant_or_admin on public.payment_ledger_portions
for select to authenticated using (
  public.is_yakka_admin() or exists (
    select 1 from public.payment_ledgers ledger
    join public.jobs job on job.id = ledger.job_id
    where ledger.id = ledger_id and auth.uid() in (job.client_id, job.trader_id)
  )
);

drop policy if exists payment_alerts_admin_read on public.payment_alerts;
create policy payment_alerts_admin_read on public.payment_alerts
for select to authenticated using (public.is_yakka_admin());

drop policy if exists payment_audit_admin_read on public.payment_admin_audit;
create policy payment_audit_admin_read on public.payment_admin_audit
for select to authenticated using (public.is_yakka_admin());

drop policy if exists reconciliation_runs_admin_read on public.payment_reconciliation_runs;
create policy reconciliation_runs_admin_read on public.payment_reconciliation_runs
for select to authenticated using (public.is_yakka_admin());

drop policy if exists reconciliation_issues_admin_read on public.payment_reconciliation_issues;
create policy reconciliation_issues_admin_read on public.payment_reconciliation_issues
for select to authenticated using (public.is_yakka_admin());

revoke all on public.payment_ledgers, public.payment_ledger_portions,
  public.payment_operations, public.payment_alerts, public.payment_admin_audit,
  public.payment_reconciliation_runs, public.payment_reconciliation_issues,
  public.webhook_events
from anon, authenticated;

grant select on public.payment_ledgers, public.payment_ledger_portions,
  public.payment_alerts, public.payment_admin_audit,
  public.payment_reconciliation_runs, public.payment_reconciliation_issues
to authenticated;

grant select on public.payment_portions_nearing_90_days to authenticated;

grant select on public.profiles, public.jobs, public.job_items, public.payments,
  public.partial_payment_requests, public.disputes, public.dispute_items,
  public.job_photos, public.messages
to authenticated;

notify pgrst, 'reload schema';
