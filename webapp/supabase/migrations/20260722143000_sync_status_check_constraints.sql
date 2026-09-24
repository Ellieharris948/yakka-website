-- Keep status check constraints aligned with the values written by the app and
-- Edge Functions. Existing production rows may contain older status values, so
-- these constraints are added as NOT VALID while still enforcing future writes.

create or replace function public.replace_text_status_check(
  p_table regclass,
  p_column text,
  p_constraint_name text,
  p_allowed text[]
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  target_attnum smallint;
  column_type_oid oid;
  column_type_schema text;
  column_type_name text;
  allowed_value text;
  existing_constraint record;
begin
  select attnum, atttypid
    into target_attnum, column_type_oid
  from pg_attribute
  where attrelid = p_table
    and attname = p_column
    and not attisdropped;

  if target_attnum is null then
    return;
  end if;

  select n.nspname, t.typname
    into column_type_schema, column_type_name
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  where t.oid = column_type_oid
    and t.typtype = 'e';

  if column_type_name is not null then
    foreach allowed_value in array p_allowed loop
      execute format(
        'alter type %I.%I add value if not exists %L',
        column_type_schema,
        column_type_name,
        allowed_value
      );
    end loop;
  end if;

  for existing_constraint in
    select conname
    from pg_constraint
    where conrelid = p_table
      and contype = 'c'
      and target_attnum = any(conkey)
  loop
    execute format(
      'alter table %s drop constraint if exists %I',
      p_table,
      existing_constraint.conname
    );
  end loop;

  execute format(
    'alter table %s add constraint %I check (%I::text = any (%L::text[])) not valid',
    p_table,
    p_constraint_name,
    p_column,
    p_allowed
  );
end;
$$;

do $$
begin
  if to_regclass('public.jobs') is not null then
    perform public.replace_text_status_check(
      'public.jobs'::regclass,
      'status',
      'jobs_status_check',
      array[
        'proposed',
        'accepted',
        'funded',
        'in_progress',
        'seller_done',
        'client_done',
        'completed',
        'disputed',
        'cancelled'
      ]
    );
  end if;

  if to_regclass('public.partial_payment_requests') is not null then
    perform public.replace_text_status_check(
      'public.partial_payment_requests'::regclass,
      'status',
      'partial_payment_requests_status_check',
      array['requested', 'approved', 'declined', 'released', 'cancelled']
    );
  end if;

  if to_regclass('public.payments') is not null then
    perform public.replace_text_status_check(
      'public.payments'::regclass,
      'status',
      'payments_status_check',
      array['awaiting_funding', 'funded', 'released', 'failed', 'cancelled', 'refunded']
    );
  end if;

  if to_regclass('public.offers') is not null then
    perform public.replace_text_status_check(
      'public.offers'::regclass,
      'status',
      'offers_status_check',
      array['pending', 'proposed', 'accepted', 'declined', 'cancelled']
    );
  end if;

  if to_regclass('public.disputes') is not null then
    perform public.replace_text_status_check(
      'public.disputes'::regclass,
      'status',
      'disputes_status_check',
      array['open', 'resolved', 'closed']
    );
  end if;

  if to_regclass('public.job_photos') is not null then
    perform public.replace_text_status_check(
      'public.job_photos'::regclass,
      'stage',
      'job_photos_stage_check',
      array['before', 'progress', 'after', 'dispute']
    );
  end if;

  if to_regclass('public.payments') is not null then
    perform public.replace_text_status_check(
      'public.payments'::regclass,
      'payment_method',
      'payments_payment_method_check',
      array['stripe_pay_by_bank', 'pay_by_bank', 'bank_transfer', 'manual']
    );

    perform public.replace_text_status_check(
      'public.payments'::regclass,
      'provider',
      'payments_provider_check',
      array['stripe', 'manual']
    );
  end if;

  if to_regclass('public.webhook_events') is not null then
    perform public.replace_text_status_check(
      'public.webhook_events'::regclass,
      'provider',
      'webhook_events_provider_check',
      array['stripe']
    );
  end if;

  if to_regclass('public.team_invites') is not null then
    perform public.replace_text_status_check(
      'public.team_invites'::regclass,
      'role',
      'team_invites_role_check',
      array['account_owner', 'team_member']
    );

    perform public.replace_text_status_check(
      'public.team_invites'::regclass,
      'status',
      'team_invites_status_check',
      array['invited', 'accepted', 'revoked']
    );
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.jobs') is not null and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.jobs'::regclass
      and attname = 'price_cents'
      and not attisdropped
  ) then
    alter table public.jobs
      drop constraint if exists jobs_price_cents_check;

    alter table public.jobs
      add constraint jobs_price_cents_check
      check (price_cents >= 0)
      not valid;
  end if;

  if to_regclass('public.jobs') is not null and exists (
    select 1
    from pg_attribute
    where attrelid = 'public.jobs'::regclass
      and attname = 'trader_id'
      and not attisdropped
  ) then
    alter table public.jobs
      alter column trader_id drop not null;
  end if;
end;
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
declare
  result public.jobs;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Add a job title.';
  end if;

  insert into public.jobs (
    trader_id,
    client_id,
    title,
    description,
    price_cents,
    currency,
    duration_days,
    planned_start_date,
    flex_days,
    country_code,
    status
  ) values (
    null,
    auth.uid(),
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    0,
    'GBP',
    1,
    p_planned_start_date,
    0,
    'GB',
    'proposed'
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.rpc_create_client_job_request(text, text, date) from public;
grant execute on function public.rpc_create_client_job_request(text, text, date) to authenticated;

create or replace function public.rpc_confirm_job_start(p_job_id uuid, p_who text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if not found then
    raise exception 'Job not found.';
  end if;

  if p_who not in ('client', 'trader') then
    raise exception 'Invalid participant.';
  end if;

  if (p_who = 'client' and j.client_id <> auth.uid()) or
     (p_who = 'trader' and j.trader_id <> auth.uid()) then
    raise exception 'You cannot confirm this participant.';
  end if;

  if not exists (
    select 1
    from public.job_photos
    where job_id = p_job_id
      and stage = 'before'
      and uploaded_by in (j.client_id, j.trader_id)
  ) then
    raise exception 'Trader or client must upload at least one before photo before the job start can be confirmed.';
  end if;

  if p_who = 'client' then
    update public.jobs set started_client = true where id = p_job_id;
  else
    update public.jobs set started_trader = true where id = p_job_id;
  end if;

  select * into j from public.jobs where id = p_job_id;
  if coalesce(j.started_client, false) and coalesce(j.started_trader, false) and j.start_date is null then
    update public.jobs
    set
      start_date = current_date,
      end_date = current_date + greatest(0, coalesce(duration_days, 1) - 1),
      status = 'in_progress'
    where id = p_job_id;
  end if;
end;
$$;

revoke all on function public.rpc_confirm_job_start(uuid, text) from public;
grant execute on function public.rpc_confirm_job_start(uuid, text) to authenticated;

do $$
declare
  review_trigger record;
begin
  if to_regclass('public.jobs') is not null then
    for review_trigger in
      select tr.tgname as trigger_name
      from pg_trigger tr
      join pg_proc p on p.oid = tr.tgfoid
      where tr.tgrelid = 'public.jobs'::regclass
        and not tr.tgisinternal
        and (
          lower(tr.tgname) like '%review%'
          or lower(p.proname) like '%review%'
          or lower(pg_get_functiondef(p.oid)) like '%review%'
        )
    loop
      execute format('drop trigger if exists %I on public.jobs', review_trigger.trigger_name);
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';

drop function public.replace_text_status_check(regclass, text, text, text[]);
