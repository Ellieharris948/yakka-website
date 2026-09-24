-- Enforce the job, evidence, dispute, and partial-release rules used by the app.
-- This migration is intentionally additive so existing test data remains usable.

create extension if not exists pgcrypto;

alter table if exists public.jobs alter column trader_id drop not null;
alter table if exists public.jobs
  add column if not exists completed_at timestamptz null,
  add column if not exists upfront_materials_cents integer not null default 0,
  add column if not exists allows_partial_payments boolean not null default false,
  add column if not exists payment_protection_fee_bps integer not null default 250;

alter table if exists public.bank_accounts
  add column if not exists stripe_connected_account_id text;

alter table if exists public.payments
  add column if not exists stripe_charge_id text,
  add column if not exists stripe_transfer_id text;

alter table if exists public.job_photos
  add column if not exists storage_path text null,
  add column if not exists job_item_id uuid null,
  add column if not exists delete_after timestamptz null;

alter table if exists public.partial_payment_requests
  add column if not exists job_item_ids uuid[] not null default '{}',
  add column if not exists evidence_photo_ids uuid[] not null default '{}',
  add column if not exists released_amount_cents integer null,
  add column if not exists stripe_transfer_id text null,
  add column if not exists released_at timestamptz null;

alter table if exists public.dispute_items
  add column if not exists evidence_photo_ids uuid[] not null default '{}';

create sequence if not exists public.dispute_request_number_seq start with 1000;
alter table if exists public.disputes
  add column if not exists request_number text null,
  add column if not exists submitted_at timestamptz null;

create unique index if not exists disputes_request_number_key
  on public.disputes(request_number) where request_number is not null;
create index if not exists job_photos_cleanup_idx
  on public.job_photos(delete_after) where delete_after is not null;

create or replace function public.next_dispute_request_number()
returns text language sql volatile set search_path = public as $$
  select 'DSP-' || to_char(current_date, 'YYYYMMDD') || '-' ||
    lpad(nextval('public.dispute_request_number_seq')::text, 6, '0');
$$;

create or replace function public.rpc_create_client_job_request(
  p_title text,
  p_description text,
  p_planned_start_date date
)
returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare result public.jobs;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if length(trim(coalesce(p_title, ''))) < 3 then raise exception 'Add a job title.'; end if;

  insert into public.jobs (
    trader_id, client_id, title, description, price_cents, currency,
    duration_days, planned_start_date, flex_days, country_code, status
  ) values (
    null, auth.uid(), trim(p_title), nullif(trim(coalesce(p_description, '')), ''),
    0, 'GBP', 1, p_planned_start_date, 0, 'GB', 'proposed'
  ) returning * into result;
  return result;
end;
$$;
revoke all on function public.rpc_create_client_job_request(text,text,date) from public;
grant execute on function public.rpc_create_client_job_request(text,text,date) to authenticated;

-- Both people must add their own before image before confirming the start.
create or replace function public.rpc_confirm_job_start(p_job_id uuid, p_who text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then raise exception 'Job not found.'; end if;
  if p_who not in ('client', 'trader') then raise exception 'Invalid participant.'; end if;
  if (p_who = 'client' and j.client_id <> auth.uid()) or
     (p_who = 'trader' and j.trader_id <> auth.uid()) then
    raise exception 'You cannot confirm this participant.';
  end if;
  if not exists (
    select 1 from public.job_photos
    where job_id = p_job_id and uploaded_by = auth.uid() and stage = 'before'
  ) then
    raise exception 'Upload at least one before photo before confirming the job start.';
  end if;
  if p_who = 'client' then
    update public.jobs set started_client = true where id = p_job_id;
  else
    update public.jobs set started_trader = true where id = p_job_id;
  end if;
  select * into j from public.jobs where id = p_job_id;
  if coalesce(j.started_client, false) and coalesce(j.started_trader, false) and j.start_date is null then
    update public.jobs
      set start_date = current_date,
          end_date = current_date + greatest(0, coalesce(duration_days, 1) - 1),
          status = 'in_progress'
    where id = p_job_id;
  end if;
end;
$$;
revoke all on function public.rpc_confirm_job_start(uuid,text) from public;
grant execute on function public.rpc_confirm_job_start(uuid,text) to authenticated;

create or replace function public.require_tradie_after_photo()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'seller_done' and old.status is distinct from new.status and not exists (
    select 1 from public.job_photos
    where job_id = new.id and uploaded_by = new.trader_id and stage = 'after'
  ) then
    raise exception 'Upload at least one completed-work photo before marking the job complete.';
  end if;
  return new;
end;
$$;
drop trigger if exists require_tradie_after_photo on public.jobs;
create trigger require_tradie_after_photo before update of status on public.jobs
for each row execute function public.require_tradie_after_photo();

create or replace function public.set_job_photo_retention()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.status = 'completed' and old.status is distinct from new.status then
    new.completed_at := coalesce(new.completed_at, now());
    update public.job_photos set delete_after = new.completed_at + interval '30 days'
      where job_id = new.id and delete_after is null;
  end if;
  return new;
end;
$$;
drop trigger if exists set_job_photo_retention on public.jobs;
create trigger set_job_photo_retention before update of status on public.jobs
for each row execute function public.set_job_photo_retention();

create or replace function public.set_new_photo_retention()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare completed timestamptz;
begin
  select completed_at into completed from public.jobs where id = new.job_id;
  if completed is not null then new.delete_after := completed + interval '30 days'; end if;
  return new;
end;
$$;
drop trigger if exists set_new_photo_retention on public.job_photos;
create trigger set_new_photo_retention before insert on public.job_photos
for each row execute function public.set_new_photo_retention();

create or replace function public.rpc_create_partial_payment_request(
  p_job_id uuid,
  p_job_item_ids uuid[],
  p_reason text,
  p_evidence_photo_ids uuid[]
)
returns public.partial_payment_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs;
  requested_amount integer;
  gross integer;
  used_amount integer;
  result public.partial_payment_requests;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found or j.trader_id <> auth.uid() then raise exception 'Only this job''s tradie can request payment.'; end if;
  if j.status not in ('funded', 'in_progress') then raise exception 'The job must be funded and live.'; end if;
  if coalesce(j.duration_days, 0) <= 28 and coalesce(j.upfront_materials_cents, 0) <= 0 then
    raise exception 'Partial payments are only available for jobs over four weeks or jobs with agreed upfront materials.';
  end if;
  if coalesce(array_length(p_job_item_ids, 1), 0) = 0 then raise exception 'Select at least one job item.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 20 then raise exception 'Please provide at least 20 characters of detail.'; end if;
  if coalesce(array_length(p_evidence_photo_ids, 1), 0) = 0 then raise exception 'Upload progress evidence first.'; end if;
  if exists (
    select 1 from unnest(p_evidence_photo_ids) id
    where not exists (
      select 1 from public.job_photos p where p.id = id and p.job_id = p_job_id and p.uploaded_by = auth.uid()
    )
  ) then raise exception 'Invalid evidence photo.'; end if;

  select coalesce(sum(greatest(1, coalesce(qty, 1)) * greatest(0, coalesce(price_cents, 0))), 0)::integer
    into requested_amount from public.job_items where job_id = p_job_id and id = any(p_job_item_ids);
  if requested_amount <= 0 then raise exception 'The selected items have no payable value.'; end if;
  select greatest(coalesce(sum(greatest(1, coalesce(qty, 1)) * greatest(0, coalesce(price_cents, 0))), 0)::integer,
                  coalesce(j.price_cents, 0))
    into gross from public.job_items where job_id = p_job_id;
  gross := gross + greatest(0, coalesce(j.upfront_materials_cents, 0));
  select coalesce(sum(amount_cents), 0)::integer into used_amount
    from public.partial_payment_requests
    where job_id = p_job_id and status in ('requested', 'approved', 'released');
  if used_amount + requested_amount > floor(gross * 0.5) then
    raise exception 'Partial payments cannot exceed 50%% of the total job value.';
  end if;

  insert into public.partial_payment_requests (
    job_id, requested_by, amount_cents, reason, status, job_item_ids, evidence_photo_ids
  ) values (
    p_job_id, auth.uid(), requested_amount, trim(p_reason), 'requested', p_job_item_ids, p_evidence_photo_ids
  ) returning * into result;
  return result;
end;
$$;
revoke all on function public.rpc_create_partial_payment_request(uuid,uuid[],text,uuid[]) from public;
grant execute on function public.rpc_create_partial_payment_request(uuid,uuid[],text,uuid[]) to authenticated;

create or replace function public.rpc_decline_partial_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare request_job_id uuid;
begin
  select job_id into request_job_id
  from public.partial_payment_requests
  where id = p_request_id and status = 'requested'
  for update;
  if request_job_id is null then raise exception 'Partial payment request not found.'; end if;
  if not exists (select 1 from public.jobs where id = request_job_id and client_id = auth.uid()) then
    raise exception 'Only this job''s customer can decline the request.';
  end if;
  update public.partial_payment_requests set status = 'declined' where id = p_request_id;
end;
$$;
revoke all on function public.rpc_decline_partial_payment_request(uuid) from public;
grant execute on function public.rpc_decline_partial_payment_request(uuid) to authenticated;
