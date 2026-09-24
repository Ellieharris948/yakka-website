-- Team members can work on behalf of the tradie account owner, so completion
-- should allow either the owner or an active member of the owner's team.

create or replace function public.rpc_seller_marks_done(p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  j public.jobs;
  can_mark_done boolean;
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

  select (
    j.trader_id = auth.uid()
    or exists (
      select 1
      from public.team_accounts ta
      join public.team_members tm
        on tm.team_account_id = ta.id
      where ta.owner_user_id = j.trader_id
        and tm.user_id = auth.uid()
        and tm.status = 'active'
    )
  ) into can_mark_done;

  if not coalesce(can_mark_done, false) then
    raise exception 'Only this job''s tradie or an active team member can mark the job complete.';
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
