-- Reassert the narrowly-scoped upload policies used by profile and job photos.
-- This repairs environments where the buckets existed before their policies
-- were deployed and includes active members of a tradie's team.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('job-images', 'job-images', true)
on conflict (id) do update set public = excluded.public;

alter table public.profiles enable row level security;

drop policy if exists yakka_profiles_update_self on public.profiles;
create policy yakka_profiles_update_self
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists avatars_insert_authenticated_owner on storage.objects;
create policy avatars_insert_authenticated_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists avatars_update_authenticated_owner on storage.objects;
create policy avatars_update_authenticated_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.can_contribute_to_job(
  p_job_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user_id is not null and exists (
    select 1
    from public.jobs job
    where job.id = p_job_id
      and (
        p_user_id in (job.client_id, job.trader_id)
        or exists (
          select 1
          from public.team_accounts account
          join public.team_members member on member.team_account_id = account.id
          where account.owner_user_id = job.trader_id
            and member.user_id = p_user_id
            and member.status = 'active'
        )
      )
  );
$$;

revoke all on function public.can_contribute_to_job(uuid, uuid) from public;
grant execute on function public.can_contribute_to_job(uuid, uuid) to authenticated, service_role;

drop policy if exists job_images_insert_participant on storage.objects;
create policy job_images_insert_participant
on storage.objects for insert to authenticated
with check (
  bucket_id = 'job-images'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.can_contribute_to_job(((storage.foldername(name))[1])::uuid, auth.uid())
);

drop policy if exists job_photos_insert_contributor on public.job_photos;
create policy job_photos_insert_contributor
on public.job_photos for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_contribute_to_job(job_id, auth.uid())
);

notify pgrst, 'reload schema';
