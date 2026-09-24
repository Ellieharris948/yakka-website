-- Tradies should be able to mark their work done without first submitting a
-- review. Reviews are collected after completion and must not gate seller_done.

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
          or lower(pg_get_functiondef(p.oid)) like '%review_required_trader%'
          or lower(pg_get_functiondef(p.oid)) like '%must submit a review%'
        )
    loop
      execute format('drop trigger if exists %I on public.jobs', review_trigger.trigger_name);
    end loop;
  end if;
end;
$$;

create or replace function public.rpc_seller_marks_done(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;

  select * into j
  from public.jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'Job not found.';
  end if;

  if j.trader_id <> auth.uid() then
    raise exception 'Only this job''s tradie can mark the job complete.';
  end if;

  if j.status <> 'in_progress' then
    raise exception 'This job is not ready to be marked complete.';
  end if;

  if not exists (
    select 1
    from public.job_photos
    where job_id = p_job_id
      and uploaded_by = auth.uid()
      and stage = 'after'
  ) then
    raise exception 'Upload at least one completed-work photo before marking the job complete.';
  end if;

  update public.jobs
  set
    status = 'seller_done',
    auto_release_at = now() + interval '7 days'
  where id = p_job_id;
end;
$$;

revoke all on function public.rpc_seller_marks_done(uuid) from public;
grant execute on function public.rpc_seller_marks_done(uuid) to authenticated;

notify pgrst, 'reload schema';
