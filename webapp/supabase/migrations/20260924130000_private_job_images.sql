-- Job, progress, and dispute photos are private evidence. Only a participant,
-- an active member of the assigned tradie's team, or a YAKKA admin may read
-- the underlying object. Clients issue short-lived signed URLs after RLS passes.

update storage.buckets
set public = false
where id = 'job-images';

update public.job_photos
set storage_path = regexp_replace(
      split_part(file_url, '?', 1),
      '^.*/storage/v1/object/public/job-images/',
      ''
    )
where storage_path is null
  and file_url like '%/storage/v1/object/public/job-images/%';

update public.job_photos
set file_url = storage_path
where storage_path is not null
  and file_url is distinct from storage_path;

drop policy if exists job_images_select_authorized on storage.objects;
create policy job_images_select_authorized
on storage.objects
for select to authenticated
using (
  bucket_id = 'job-images'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and (
    public.is_yakka_admin()
    or public.can_contribute_to_job(
      ((storage.foldername(name))[1])::uuid,
      auth.uid()
    )
  )
);

notify pgrst, 'reload schema';
