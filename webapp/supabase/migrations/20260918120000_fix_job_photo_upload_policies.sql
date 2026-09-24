-- Allow job participants, and active members of the tradie's team, to store
-- photo evidence and create the matching job_photos record.

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
      and p_user_id in (job.client_id, job.trader_id)
  );
$$;

revoke all on function public.can_contribute_to_job(uuid, uuid) from public;
grant execute on function public.can_contribute_to_job(uuid, uuid) to authenticated, service_role;

alter table public.job_photos enable row level security;

drop policy if exists job_photos_read_contributor on public.job_photos;
create policy job_photos_read_contributor
on public.job_photos
for select to authenticated
using (public.can_contribute_to_job(job_id, auth.uid()));

drop policy if exists job_photos_insert_contributor on public.job_photos;
create policy job_photos_insert_contributor
on public.job_photos
for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and public.can_contribute_to_job(job_id, auth.uid())
);

drop policy if exists job_images_insert_participant on storage.objects;
create policy job_images_insert_participant
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'job-images'
  and (storage.foldername(name))[2] = auth.uid()::text
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.can_contribute_to_job(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

notify pgrst, 'reload schema';

insert into supabase_migrations.schema_migrations(version, name, statements)
values (
  '20260918120000',
  'fix_job_photo_upload_policies',
  array['Applied job photo table and storage participant policies.']
)
on conflict (version) do nothing;
