-- Complete and secure the partial-payment schema used by the app and payout
-- function. This migration is additive and preserves existing records.

alter table if exists public.job_photos
  add column if not exists storage_path text,
  add column if not exists job_item_id uuid,
  add column if not exists delete_after timestamptz;

alter table if exists public.partial_payment_requests
  add column if not exists job_item_ids uuid[] not null default '{}',
  add column if not exists evidence_photo_ids uuid[] not null default '{}',
  add column if not exists released_amount_cents integer,
  add column if not exists stripe_transfer_id text,
  add column if not exists released_at timestamptz;

create index if not exists partial_payment_requests_job_status_idx
  on public.partial_payment_requests(job_id, status);

create index if not exists job_photos_cleanup_idx
  on public.job_photos(delete_after)
  where delete_after is not null;

create or replace function public.set_job_auto_release_deadline()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'seller_done' and old.status is distinct from new.status then
    new.auto_release_at := coalesce(new.auto_release_at, now() + interval '7 days');
  end if;
  return new;
end;
$$;

drop trigger if exists set_job_auto_release_deadline on public.jobs;
create trigger set_job_auto_release_deadline
before update of status on public.jobs
for each row execute function public.set_job_auto_release_deadline();

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
  if not found or j.trader_id <> auth.uid() then
    raise exception 'Only this job''s tradie can request payment.';
  end if;
  if j.status not in ('funded', 'in_progress') then
    raise exception 'The job must be funded and live.';
  end if;
  if coalesce(j.duration_days, 0) <= 28 and coalesce(j.upfront_materials_cents, 0) <= 0 then
    raise exception 'Partial payments are only available for jobs over four weeks or jobs with agreed upfront materials.';
  end if;
  if coalesce(array_length(p_job_item_ids, 1), 0) = 0 then
    raise exception 'Select at least one job item.';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Please provide at least 20 characters of detail.';
  end if;
  if coalesce(array_length(p_evidence_photo_ids, 1), 0) = 0 then
    raise exception 'Upload progress evidence first.';
  end if;

  if exists (
    select 1
    from unnest(p_job_item_ids) requested_id
    where not exists (
      select 1 from public.job_items item
      where item.id = requested_id and item.job_id = p_job_id
    )
  ) then
    raise exception 'Invalid job item.';
  end if;

  if exists (
    select 1
    from public.partial_payment_requests previous,
         unnest(previous.job_item_ids) previous_item_id
    where previous.job_id = p_job_id
      and previous.status in ('requested', 'approved', 'released')
      and previous_item_id = any(p_job_item_ids)
  ) then
    raise exception 'One or more selected items already have a payment request.';
  end if;

  if exists (
    select 1
    from unnest(p_evidence_photo_ids) evidence_id
    where not exists (
      select 1 from public.job_photos photo
      where photo.id = evidence_id
        and photo.job_id = p_job_id
        and photo.uploaded_by = auth.uid()
    )
  ) then
    raise exception 'Invalid evidence photo.';
  end if;

  select coalesce(sum(
    greatest(1, coalesce(qty, 1)) * greatest(0, coalesce(price_cents, 0))
  ), 0)::integer
  into requested_amount
  from public.job_items
  where job_id = p_job_id and id = any(p_job_item_ids);

  if requested_amount <= 0 then
    raise exception 'The selected items have no payable value.';
  end if;

  select greatest(
    coalesce(sum(greatest(1, coalesce(qty, 1)) * greatest(0, coalesce(price_cents, 0))), 0)::integer,
    coalesce(j.price_cents, 0)
  )
  into gross
  from public.job_items
  where job_id = p_job_id;
  gross := gross + greatest(0, coalesce(j.upfront_materials_cents, 0));

  select coalesce(sum(amount_cents), 0)::integer
  into used_amount
  from public.partial_payment_requests
  where job_id = p_job_id and status in ('requested', 'approved', 'released');

  if used_amount + requested_amount > floor(gross * 0.5) then
    raise exception 'Partial payments cannot exceed 50%% of the total job value.';
  end if;

  insert into public.partial_payment_requests (
    job_id,
    requested_by,
    amount_cents,
    reason,
    status,
    job_item_ids,
    evidence_photo_ids
  ) values (
    p_job_id,
    auth.uid(),
    requested_amount,
    trim(p_reason),
    'requested',
    p_job_item_ids,
    p_evidence_photo_ids
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.rpc_create_partial_payment_request(uuid, uuid[], text, uuid[]) from public;
grant execute on function public.rpc_create_partial_payment_request(uuid, uuid[], text, uuid[]) to authenticated;

create or replace function public.rpc_decline_partial_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_job_id uuid;
begin
  select job_id into request_job_id
  from public.partial_payment_requests
  where id = p_request_id and status = 'requested'
  for update;

  if request_job_id is null then
    raise exception 'Partial payment request not found.';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = request_job_id and client_id = auth.uid()
  ) then
    raise exception 'Only this job''s customer can decline the request.';
  end if;

  update public.partial_payment_requests
  set status = 'declined', updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.rpc_decline_partial_payment_request(uuid) from public;
grant execute on function public.rpc_decline_partial_payment_request(uuid) to authenticated;
